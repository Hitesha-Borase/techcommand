import fs from "node:fs";
import { resolve } from "node:path";

const filePath = resolve("02_Existing_Source/TechCommand_Source_Migration_Handoff_v171/source/components/parts-inventory-center.tsx");
let content = fs.readFileSync(filePath, "utf8");

// Normalize line endings to LF
content = content.replace(/\r\n/g, "\n");

// Replace handleAddPart body
const oldAddPart = `  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNumber || !newPartName) {
      toast.error("Please enter both Part Number and Name");
      return;
    }
    const newCatalogItem: CatalogPart = {
      id: \`cat-\${Date.now()}\`,
      partNumber: newPartNumber.trim().toUpperCase(),
      name: newPartName.trim(),
      manufacturer: newManufacturer.trim() || "Generic OEM",
      category: newCategory,
      warehouseStock: parseInt(newStockQty) || 10,
      totalVanStock: 0,
      minThreshold: 5,
      unitCost: parseFloat(newUnitCost) || 0,
      retailPrice: parseFloat(newRetailPrice) || 0,
      status: "In Stock",
    };
    setCatalog([newCatalogItem, ...catalog]);
    setIsAddPartOpen(false);
    toast.success(\`Part \${newCatalogItem.partNumber} added to master catalog\`);
    setNewPartNumber("");
    setNewPartName("");
  };`;

const newAddPart = `  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNumber || !newPartName) {
      toast.error("Please enter both Part Number and Name");
      return;
    }
    const payload = {
      partNumber: newPartNumber.trim().toUpperCase(),
      name: newPartName.trim(),
      manufacturer: newManufacturer.trim() || "Generic OEM",
      category: newCategory,
      warehouseStock: parseInt(newStockQty) || 10,
      minThreshold: 5,
      unitCost: parseFloat(newUnitCost) || 0,
      retailPrice: parseFloat(newRetailPrice) || 0,
      status: "In Stock" as const,
    };

    try {
      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to save part to database");
        return;
      }
      toast.success(\`Part \${payload.partNumber} saved to live database\`);
      setIsAddPartOpen(false);
      setNewPartNumber("");
      setNewPartName("");
      await fetchPartsData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
    }
  };`;

const oldAdjustStock = `  const handleAdjustStock = () => {
    if (!selectedPartForAdjustment) return;
    const qtyChange = parseInt(adjustmentQty) || 0;
    setVanStock((prev) =>
      prev.map((item) => {
        if (item.id === selectedPartForAdjustment.id) {
          const nextQty = Math.max(0, item.qtyOnHand + qtyChange);
          return { ...item, qtyOnHand: nextQty };
        }
        return item;
      }),
    );
    setIsAdjustStockOpen(false);
    toast.success(\`Stock for \${selectedPartForAdjustment.partNumber} updated (\${qtyChange > 0 ? \`+\${qtyChange}\` : qtyChange})\`);
  };`;

const newAdjustStock = `  const handleAdjustStock = async () => {
    if (!selectedPartForAdjustment) return;
    const qtyChange = parseInt(adjustmentQty) || 0;
    try {
      const res = await fetch("/api/parts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedPartForAdjustment.id,
          action: "adjust_van_stock",
          vanStockId: selectedPartForAdjustment.id,
          qtyChange,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Failed to adjust stock");
        return;
      }
      toast.success(\`Stock for \${selectedPartForAdjustment.partNumber} updated (\${qtyChange > 0 ? \`+\${qtyChange}\` : qtyChange}) in database\`);
      setIsAdjustStockOpen(false);
      await fetchPartsData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to adjust stock";
      toast.error(msg);
    }
  };`;

if (!content.includes(oldAddPart)) {
  console.error("ERROR: oldAddPart pattern not found");
  process.exit(1);
}

content = content.replace(oldAddPart, newAddPart);
content = content.replace(oldAdjustStock, newAdjustStock);

fs.writeFileSync(filePath, content, "utf8");
console.log("SUCCESS: parts-inventory-center.tsx wired to live /api/parts!");

