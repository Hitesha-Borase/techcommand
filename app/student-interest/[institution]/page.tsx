import { StudentInterestForm } from "@/components/student-interest-form";

const institutions: Record<string, string> = { dacc: "Delaware Area Career Center (DACC)" };
export const dynamic = "force-dynamic";

export default async function StudentInterestPage({ params }: { params: Promise<{ institution: string }> }) {
  const { institution } = await params;
  const name = institutions[institution];
  if (!name) return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Application link unavailable</h1><p className="mt-3 text-slate-600">Please request a current TechFlex student-interest link from your program coordinator.</p></main>;
  return <StudentInterestForm institution={institution} institutionName={name} />;
}
