<?php
/**
 * Plugin Name: TechCommand Website Intake
 * Description: Securely routes approved Elementor form submissions from TechFlexMobility.com into TechCommand OS.
 * Version: 1.0.3
 * Author: TechFlex Mobility Solutions
 * Requires at least: 6.5
 * Requires PHP: 8.0
 */

if (!defined('ABSPATH')) {
    exit;
}

final class TechCommand_Website_Intake {
    const VERSION = '1.0.3';
    const OPTION_ENDPOINT = 'techcommand_intake_endpoint';
    const OPTION_SECRET = 'techcommand_intake_secret';
    const OPTION_SITE_TOKEN = 'techcommand_sites_authorization';
    const OPTION_LAST_STATUS = 'techcommand_intake_last_status';
    const CRON_HOOK = 'techcommand_intake_retry_queue';
    const TABLE_SUFFIX = 'techcommand_intake_queue';

    public static function boot() {
        add_action('elementor_pro/forms/new_record', array(__CLASS__, 'capture_elementor_submission'), 20, 2);
        add_action(self::CRON_HOOK, array(__CLASS__, 'process_queue'));
        add_action('init', array(__CLASS__, 'ensure_schedule'));
        add_action('admin_menu', array(__CLASS__, 'admin_menu'));
        add_action('admin_post_techcommand_intake_settings', array(__CLASS__, 'save_settings'));
        add_action('admin_post_techcommand_intake_retry', array(__CLASS__, 'retry_now'));
        add_action('admin_notices', array(__CLASS__, 'configuration_notice'));
    }

    public static function activate() {
        global $wpdb;
        $table = self::table_name();
        $charset = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            submission_id varchar(190) NOT NULL,
            workflow varchar(40) NOT NULL,
            payload longtext NOT NULL,
            files longtext NULL,
            attempts smallint unsigned NOT NULL DEFAULT 0,
            status varchar(20) NOT NULL DEFAULT 'queued',
            next_attempt datetime NULL,
            last_error text NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY submission_id (submission_id),
            KEY status_next_attempt (status, next_attempt)
        ) {$charset};");

        $bootstrap = plugin_dir_path(__FILE__) . 'bootstrap-config.php';
        if (is_readable($bootstrap)) {
            $config = include $bootstrap;
            if (is_array($config)) {
                self::store_configuration($config);
            }
            @unlink($bootstrap);
        }

        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 300, 'five_minutes', self::CRON_HOOK);
        }
    }

    public static function deactivate() {
        $timestamp = wp_next_scheduled(self::CRON_HOOK);
        if ($timestamp) {
            wp_unschedule_event($timestamp, self::CRON_HOOK);
        }
    }

    public static function ensure_schedule() {
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 60, 'five_minutes', self::CRON_HOOK);
        }
    }

    public static function cron_schedules($schedules) {
        $schedules['five_minutes'] = array(
            'interval' => 300,
            'display' => 'Every five minutes',
        );
        return $schedules;
    }

    private static function table_name() {
        global $wpdb;
        return $wpdb->prefix . self::TABLE_SUFFIX;
    }

    private static function store_configuration($config) {
        if (!empty($config['endpoint']) && self::valid_endpoint($config['endpoint'])) {
            update_option(self::OPTION_ENDPOINT, esc_url_raw($config['endpoint']), false);
        }
        if (!empty($config['intake_secret'])) {
            update_option(self::OPTION_SECRET, sanitize_text_field($config['intake_secret']), false);
        }
        if (!empty($config['sites_authorization'])) {
            update_option(self::OPTION_SITE_TOKEN, sanitize_text_field($config['sites_authorization']), false);
        }
    }

    private static function valid_endpoint($endpoint) {
        $parts = wp_parse_url($endpoint);
        return is_array($parts)
            && isset($parts['scheme'], $parts['host'], $parts['path'])
            && in_array($parts['scheme'], array('https', 'http'), true)
            && $parts['path'] === '/api/integrations/v1/website-leads';
    }

    public static function capture_elementor_submission($record, $ajax_handler) {
        try {
            $mapped = self::map_record($record);
            if (!$mapped) {
                return;
            }
            self::enqueue($mapped['payload'], $mapped['files']);
            self::process_submission($mapped['payload']['submissionId']);
        } catch (Throwable $error) {
            self::record_status('error', 0, 'Capture failed: ' . $error->getMessage(), 'unknown');
            error_log('TechCommand intake capture failed: ' . $error->getMessage());
        }
    }

    private static function map_record($record) {
        $raw_fields = $record->get('fields');
        if (!is_array($raw_fields) || !$raw_fields) {
            return null;
        }

        $fields = array();
        foreach ($raw_fields as $id => $field) {
            $title = isset($field['title']) ? trim((string) $field['title']) : '';
            $value = $field['value'] ?? ($field['raw_value'] ?? '');
            if (is_array($value)) {
                $value = implode(', ', array_map('strval', $value));
            }
            $fields[self::field_key($title ?: $id)] = trim(wp_strip_all_tags((string) $value));
        }

        $form_name = trim((string) $record->get_form_settings('form_name'));
        $source_url = self::source_url($record);
        $email = self::pick($fields, array('email', 'email address'));
        $name = self::pick($fields, array('contact name', 'full name', 'name'));
        $phone = self::pick($fields, array('phone', 'phone number'));
        $company = self::pick($fields, array('company or facility', 'company', 'facility'));
        $job_title = self::pick($fields, array('job title', 'position applied for'));
        $service_type = self::pick($fields, array('what can we help you with', 'service type'));
        $message = self::pick($fields, array('message', 'cover letter', 'details', 'description'));

        $workflow = self::workflow($form_name, $source_url, $fields, $service_type);
        if (!$workflow) {
            return null;
        }

        $city = self::pick($fields, array('service city', 'city'));
        $state = self::pick($fields, array('state'));
        $zip = self::pick($fields, array('zip code', 'zip', 'postal code'));
        $address = implode(', ', array_filter(array($city, $state, $zip)));
        $submission_id = 'wp-' . wp_generate_uuid4();
        $payload = array(
            'workflow' => $workflow,
            'submissionId' => $submission_id,
            'name' => $name ?: null,
            'email' => $email ?: null,
            'phone' => $phone ?: null,
            'company' => $company ?: null,
            'jobTitle' => $job_title ?: null,
            'serviceType' => $service_type ?: self::service_from_url($source_url),
            'address' => $address ?: null,
            'message' => $message ?: null,
            'sourcePageUrl' => $source_url ?: null,
            'marketingConsent' => $workflow === 'newsletter',
            'consentText' => $workflow === 'newsletter'
                ? 'Visitor submitted the newsletter signup form on TechFlexMobility.com.'
                : null,
        );

        if ($workflow !== 'newsletter' && !$name && !$email && !$phone) {
            return null;
        }

        return array(
            'payload' => $payload,
            'files' => self::extract_files($record),
        );
    }

    private static function workflow($form_name, $source_url, $fields, $service_type) {
        $normalized_name = self::field_key($form_name);
        if ($normalized_name === 'career form') {
            return 'career';
        }
        if (count($fields) === 1 && isset($fields['email'])) {
            return 'newsletter';
        }
        $path = strtolower((string) wp_parse_url($source_url, PHP_URL_PATH));
        if (strpos($path, '/contract-with-us') !== false || strpos($path, '/manufacturers-retailers') !== false) {
            return 'partnership';
        }
        $service = strtolower((string) $service_type);
        if (strpos($service, 'manufacturer') !== false || strpos($service, 'contract') !== false) {
            return 'partnership';
        }
        if (in_array($normalized_name, array('home page contact form', 'contact form'), true)) {
            return $service === 'others' || $service === 'other' ? 'contact' : 'quote_request';
        }
        if (self::service_from_url($source_url)) {
            return 'service_request';
        }
        return 'contact';
    }

    private static function service_from_url($url) {
        $path = strtolower((string) wp_parse_url($url, PHP_URL_PATH));
        $services = array(
            '/biomedical-htm-services' => 'Biomedical & HTM',
            '/mobility-dme-services' => 'Mobility & DME',
            '/facility-equipment-services' => 'Facility Equipment',
            '/delivery-deployment-services' => 'Delivery & Deployment',
        );
        foreach ($services as $needle => $label) {
            if (strpos($path, $needle) !== false) {
                return $label;
            }
        }
        return null;
    }

    private static function source_url($record) {
        $meta = $record->get('meta');
        if (is_array($meta)) {
            foreach (array('page_url', 'referer_url', 'url') as $key) {
                if (!empty($meta[$key])) {
                    $candidate = is_array($meta[$key]) ? ($meta[$key]['value'] ?? '') : $meta[$key];
                    if (is_string($candidate) && wp_http_validate_url($candidate)) {
                        return esc_url_raw($candidate);
                    }
                }
            }
        }
        $referer = wp_get_referer();
        return $referer && wp_http_validate_url($referer) ? esc_url_raw($referer) : home_url('/');
    }

    private static function field_key($value) {
        $value = strtolower(remove_accents((string) $value));
        $value = preg_replace('/[^a-z0-9]+/', ' ', $value);
        return trim($value);
    }

    private static function pick($fields, $labels) {
        foreach ($labels as $label) {
            $key = self::field_key($label);
            if (isset($fields[$key]) && $fields[$key] !== '') {
                return $fields[$key];
            }
        }
        return '';
    }

    private static function extract_files($record) {
        $values = array();
        self::flatten_files($record->get('files'), $values);
        $paths = array();
        $uploads = wp_upload_dir();
        $base_dir = realpath($uploads['basedir']);
        foreach (array_unique($values) as $candidate) {
            $path = $candidate;
            if (filter_var($candidate, FILTER_VALIDATE_URL) && strpos($candidate, $uploads['baseurl']) === 0) {
                $path = $uploads['basedir'] . substr($candidate, strlen($uploads['baseurl']));
            }
            $real = realpath($path);
            if ($real && $base_dir && strpos($real, $base_dir . DIRECTORY_SEPARATOR) === 0 && is_readable($real)) {
                $paths[] = $real;
            }
        }
        return array_slice($paths, 0, 3);
    }

    private static function flatten_files($value, &$results) {
        if (is_array($value)) {
            foreach ($value as $item) {
                self::flatten_files($item, $results);
            }
        } elseif (is_string($value) && $value !== '') {
            $results[] = $value;
        }
    }

    private static function enqueue($payload, $files) {
        global $wpdb;
        $now = current_time('mysql', true);
        $wpdb->query($wpdb->prepare(
            'INSERT IGNORE INTO ' . self::table_name() . ' (submission_id, workflow, payload, files, attempts, status, next_attempt, created_at, updated_at) VALUES (%s, %s, %s, %s, 0, %s, %s, %s, %s)',
            $payload['submissionId'],
            $payload['workflow'],
            wp_json_encode($payload),
            wp_json_encode($files),
            'queued',
            $now,
            $now,
            $now
        ));
    }

    public static function process_queue() {
        global $wpdb;
        $rows = $wpdb->get_col($wpdb->prepare(
            'SELECT submission_id FROM ' . self::table_name() . " WHERE status IN ('queued','retry') AND next_attempt <= %s ORDER BY id ASC LIMIT 10",
            current_time('mysql', true)
        ));
        foreach ($rows as $submission_id) {
            self::process_submission($submission_id);
        }
    }

    private static function process_submission($submission_id) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . self::table_name() . ' WHERE submission_id = %s LIMIT 1',
            $submission_id
        ), ARRAY_A);
        if (!$row || $row['status'] === 'sent') {
            return;
        }

        $payload = json_decode($row['payload'], true);
        $files = json_decode($row['files'], true);
        $result = self::deliver($payload, is_array($files) ? $files : array());
        $attempts = ((int) $row['attempts']) + 1;
        $now = current_time('mysql', true);

        if ($result['success']) {
            $wpdb->update(self::table_name(), array(
                'status' => 'sent',
                'attempts' => $attempts,
                'payload' => '{}',
                'files' => '[]',
                'last_error' => null,
                'next_attempt' => null,
                'updated_at' => $now,
            ), array('id' => $row['id']));
            self::record_status('sent', $result['code'], '', $row['workflow']);
            return;
        }

        $delays = array(300, 1800, 7200);
        $retry = $attempts < 4;
        $delay = $delays[min($attempts - 1, count($delays) - 1)];
        $wpdb->update(self::table_name(), array(
            'status' => $retry ? 'retry' : 'failed',
            'attempts' => $attempts,
            'last_error' => substr($result['error'], 0, 1000),
            'next_attempt' => $retry ? gmdate('Y-m-d H:i:s', time() + $delay) : null,
            'updated_at' => $now,
        ), array('id' => $row['id']));
        self::record_status($retry ? 'retry' : 'failed', $result['code'], $result['error'], $row['workflow']);
    }

    private static function deliver($payload, $files) {
        $endpoint = get_option(self::OPTION_ENDPOINT, '');
        $secret = get_option(self::OPTION_SECRET, '');
        $site_token = get_option(self::OPTION_SITE_TOKEN, '');
        if (!self::valid_endpoint($endpoint) || !$secret || !$site_token) {
            return array('success' => false, 'code' => 0, 'error' => 'Connector configuration is incomplete.');
        }

        $boundary = 'techcommand-' . wp_generate_password(24, false, false);
        $body = '';
        foreach ($payload as $key => $value) {
            if ($value === null) {
                continue;
            }
            $body .= '--' . $boundary . "\r\n";
            // Preserve the API's camel-case field names. sanitize_key() lowercases
            // them, which would turn submissionId into submissionid and make an
            // otherwise valid request fail schema validation.
            $safe_key = preg_replace('/[^A-Za-z0-9_]/', '', (string) $key);
            $body .= 'Content-Disposition: form-data; name="' . $safe_key . '"' . "\r\n\r\n";
            $body .= (is_bool($value) ? ($value ? 'true' : 'false') : (string) $value) . "\r\n";
        }
        foreach (array_slice($files, 0, 3) as $path) {
            $real = realpath($path);
            if (!$real || !is_readable($real) || filesize($real) > 15 * MB_IN_BYTES) {
                continue;
            }
            $type = wp_check_filetype($real)['type'] ?: 'application/octet-stream';
            $body .= '--' . $boundary . "\r\n";
            $body .= 'Content-Disposition: form-data; name="files[]"; filename="' . sanitize_file_name(basename($real)) . '"' . "\r\n";
            $body .= 'Content-Type: ' . $type . "\r\n\r\n";
            $body .= file_get_contents($real) . "\r\n";
        }
        $body .= '--' . $boundary . "--\r\n";

        $response = wp_remote_post($endpoint, array(
            'timeout' => 30,
            'redirection' => 0,
            'sslverify' => true,
            'reject_unsafe_urls' => true,
            'headers' => array(
                'Content-Type' => 'multipart/form-data; boundary=' . $boundary,
                'OAI-Sites-Authorization' => 'Bearer ' . $site_token,
                'X-TechCommand-Intake-Secret' => $secret,
                'User-Agent' => 'TechFlex-WordPress-Connector/' . self::VERSION,
            ),
            'body' => $body,
        ));
        if (is_wp_error($response)) {
            return array('success' => false, 'code' => 0, 'error' => $response->get_error_message());
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $success = in_array($code, array(200, 202), true);
        $response_body = trim(wp_strip_all_tags((string) wp_remote_retrieve_body($response)));
        return array(
            'success' => $success,
            'code' => $code,
            'error' => $success
                ? ''
                : 'TechCommand returned HTTP ' . $code . ($response_body ? ': ' . substr($response_body, 0, 700) : '.'),
        );
    }

    private static function record_status($status, $code, $error, $workflow) {
        update_option(self::OPTION_LAST_STATUS, array(
            'status' => sanitize_key($status),
            'http_code' => (int) $code,
            'workflow' => sanitize_key($workflow),
            'error' => sanitize_text_field($error),
            'time' => current_time('mysql'),
        ), false);
    }

    public static function admin_menu() {
        add_options_page(
            'TechCommand Intake',
            'TechCommand Intake',
            'manage_options',
            'techcommand-intake',
            array(__CLASS__, 'settings_page')
        );
    }

    public static function configuration_notice() {
        if (!current_user_can('manage_options') || self::configured()) {
            return;
        }
        echo '<div class="notice notice-warning"><p><strong>TechCommand Website Intake:</strong> secure connection setup is incomplete.</p></div>';
    }

    private static function configured() {
        return self::valid_endpoint(get_option(self::OPTION_ENDPOINT, ''))
            && (bool) get_option(self::OPTION_SECRET, '')
            && (bool) get_option(self::OPTION_SITE_TOKEN, '');
    }

    public static function settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        global $wpdb;
        $counts = $wpdb->get_results('SELECT status, COUNT(*) AS total FROM ' . self::table_name() . ' GROUP BY status', OBJECT_K);
        $last = get_option(self::OPTION_LAST_STATUS, array());
        ?>
        <div class="wrap">
            <h1>TechCommand Website Intake</h1>
            <p>This connector sends approved Elementor submissions to TechCommand OS while preserving the website's existing email actions.</p>
            <table class="widefat striped" style="max-width:760px">
                <tbody>
                    <tr><th>Connection</th><td><?php echo self::configured() ? '<strong style="color:#06752d">Configured</strong>' : '<strong style="color:#b32d2e">Incomplete</strong>'; ?></td></tr>
                    <tr><th>Sent</th><td><?php echo esc_html($counts['sent']->total ?? 0); ?></td></tr>
                    <tr><th>Waiting/retrying</th><td><?php echo esc_html(($counts['queued']->total ?? 0) + ($counts['retry']->total ?? 0)); ?></td></tr>
                    <tr><th>Failed</th><td><?php echo esc_html($counts['failed']->total ?? 0); ?></td></tr>
                    <tr><th>Last result</th><td><?php echo $last ? esc_html(($last['status'] ?? '') . ' — HTTP ' . ($last['http_code'] ?? 0) . ' — ' . ($last['workflow'] ?? '') . ' — ' . ($last['time'] ?? '')) : 'No delivery attempted yet.'; ?></td></tr>
                    <?php if (!empty($last['error'])) : ?>
                    <tr><th>Last error</th><td><code><?php echo esc_html($last['error']); ?></code></td></tr>
                    <?php endif; ?>
                </tbody>
            </table>
            <p><em>Security credentials are stored server-side and are never displayed on this page.</em></p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top:16px">
                <input type="hidden" name="action" value="techcommand_intake_retry">
                <?php wp_nonce_field('techcommand_intake_retry'); ?>
                <?php submit_button('Retry queued deliveries now', 'secondary', 'submit', false); ?>
            </form>
        </div>
        <?php
    }

    public static function save_settings() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized', 403);
        }
        check_admin_referer('techcommand_intake_settings');
        self::store_configuration(array(
            'endpoint' => isset($_POST['endpoint']) ? wp_unslash($_POST['endpoint']) : '',
            'intake_secret' => isset($_POST['intake_secret']) ? wp_unslash($_POST['intake_secret']) : '',
            'sites_authorization' => isset($_POST['sites_authorization']) ? wp_unslash($_POST['sites_authorization']) : '',
        ));
        wp_safe_redirect(admin_url('options-general.php?page=techcommand-intake&updated=1'));
        exit;
    }

    public static function retry_now() {
        if (!current_user_can('manage_options')) {
            wp_die('Unauthorized', 403);
        }
        check_admin_referer('techcommand_intake_retry');
        self::process_queue();
        wp_safe_redirect(admin_url('options-general.php?page=techcommand-intake&retried=1'));
        exit;
    }
}

add_filter('cron_schedules', array('TechCommand_Website_Intake', 'cron_schedules'));
register_activation_hook(__FILE__, array('TechCommand_Website_Intake', 'activate'));
register_deactivation_hook(__FILE__, array('TechCommand_Website_Intake', 'deactivate'));
TechCommand_Website_Intake::boot();
