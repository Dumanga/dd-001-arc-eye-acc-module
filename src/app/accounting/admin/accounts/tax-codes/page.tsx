import { TaxCodesScreen } from "@/components/accounting/tax-codes-screen";
import { getTaxCodesPayload } from "@/lib/accounting/tax-codes";

export default async function TaxCodesPage() {
  const initialData = await getTaxCodesPayload();

  return <TaxCodesScreen initialData={initialData} />;
}
