"use client";

import { Banknote, BarChart3, Calculator, MessageSquareText } from "lucide-react";
import { CustomerFeedbackCenter } from "@/components/customer-feedback-center";
import { FinanceCloseoutCenter } from "@/components/finance-closeout-center";
import { PricingPolicyCenter } from "@/components/pricing-policy-center";
import { PricingIntelligenceCenter } from "@/components/pricing-intelligence-center";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function FinanceCenter({ initialTab = "closeout", role = "" }: { initialTab?: string; role?: string }) {
  return (
    <Tabs defaultValue={initialTab} className="space-y-5">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="closeout">
          <Banknote /> Billing & payroll
        </TabsTrigger>
        <TabsTrigger value="feedback">
          <MessageSquareText /> Customer follow-up
        </TabsTrigger>
        <TabsTrigger value="pricing">
          <Calculator /> Pricing rules
        </TabsTrigger>
        <TabsTrigger value="intelligence">
          <BarChart3 /> Pricing intelligence
        </TabsTrigger>
      </TabsList>
      <TabsContent value="closeout">
        <FinanceCloseoutCenter />
      </TabsContent>
      <TabsContent value="feedback">
        <CustomerFeedbackCenter />
      </TabsContent>
      <TabsContent value="pricing">
        <PricingPolicyCenter canEdit={role === "owner_administrator" || role === "finance"} />
      </TabsContent>
      <TabsContent value="intelligence">
        <PricingIntelligenceCenter />
      </TabsContent>
    </Tabs>
  );
}
