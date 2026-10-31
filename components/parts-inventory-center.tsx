"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Layers,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Truck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type VanStockItem = {
  id: string;
  partNumber: string;
  name: string;
  category: "Batteries" | "Electronics" | "Motors & Actuators" | "Tires & Casters" | "Hardware & Cables" | "Biomedical";
  vanId: string;
  vanName: string;
  technicianName: string;
  qtyOnHand: number;
  parLevel: number;
  unitCost: number;
  retailPrice: number;
  binLocation: string;
};

type CatalogPart = {
  id: string;
  partNumber: string;
  name: string;
  manufacturer: string;
  category: "Batteries" | "Electronics" | "Motors & Actuators" | "Tires & Casters" | "Hardware & Cables" | "Biomedical";
  warehouseStock: number;
  totalVanStock: number;
  minThreshold: number;
  unitCost: number;
  retailPrice: number;
  status: "In Stock" | "Low Stock" | "Critical";
};

type InstalledPart = {
  id: string;
  workOrderId: string;
  technicianName: string;
  equipmentModel: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  qty: number;
  installedDate: string;
  unitPrice: number;
  warrantyStatus: "Manufacturer Warranty" | "Billable to Customer" | "RMA Return";
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  vendor: string;
  partNumber: string;
  partName: string;
  qty: number;
  totalCost: number;
  status: "Received" | "Shipped" | "Ordered" | "RMA Pending";
  trackingNumber: string;
  orderDate: string;
};

const INITIAL_VANS = [
  { id: "van-101", code: "Van 101", tech: "Marcus Vance", capacity: "84%", itemsCount: 42, value: 5840 },
  { id: "van-102", code: "Van 102", tech: "Elena Rostova", capacity: "91%", itemsCount: 56, value: 8920 },
  { id: "van-103", code: "Van 103", tech: "David Chen", capacity: "72%", itemsCount: 35, value: 4350 },
  { id: "warehouse", code: "Main Hub", tech: "Central Warehouse (Westerville)", capacity: "65%", itemsCount: 310, value: 42100 },
];

const INITIAL_VAN_STOCK: VanStockItem[] = [
  { id: "vs-1", partNumber: "BAT-12V-55AH", name: "12V 55Ah Gel Cell Deep Cycle Battery", category: "Batteries", vanId: "van-101", vanName: "Van 101", technicianName: "Marcus Vance", qtyOnHand: 4, parLevel: 6, unitCost: 110, retailPrice: 185, binLocation: "BIN-A1" },
  { id: "vs-2", partNumber: "JOY-VR2-4K", name: "PG Drives VR2 4-Key Joystick Controller", category: "Electronics", vanId: "van-101", vanName: "Van 101", technicianName: "Marcus Vance", qtyOnHand: 2, parLevel: 2, unitCost: 245, retailPrice: 420, binLocation: "BIN-B3" },
  { id: "vs-3", partNumber: "TIR-14X3-FOAM", name: "14x3 Foam-Filled Drive Tire (Grey)", category: "Tires & Casters", vanId: "van-101", vanName: "Van 101", technicianName: "Marcus Vance", qtyOnHand: 6, parLevel: 4, unitCost: 55, retailPrice: 95, binLocation: "BIN-C1" },
  { id: "vs-4", partNumber: "FUS-MAXI-40A", name: "40A Maxi Fuse & In-Line Holder Assembly", category: "Hardware & Cables", vanId: "van-101", vanName: "Van 101", technicianName: "Marcus Vance", qtyOnHand: 8, parLevel: 10, unitCost: 4.5, retailPrice: 12, binLocation: "BIN-D2" },
  { id: "vs-5", partNumber: "BIO-CAL-SEN-01", name: "O2 Flow Sensor Transducer Kit", category: "Biomedical", vanId: "van-102", vanName: "Van 102", technicianName: "Elena Rostova", qtyOnHand: 3, parLevel: 4, unitCost: 180, retailPrice: 290, binLocation: "BIN-BIO-1" },
  { id: "vs-6", partNumber: "BIO-BATT-LION", name: "Stryker Smart Power 14.4V Lithium Pack", category: "Biomedical", vanId: "van-102", vanName: "Van 102", technicianName: "Elena Rostova", qtyOnHand: 2, parLevel: 3, unitCost: 310, retailPrice: 520, binLocation: "BIN-BIO-2" },
  { id: "vs-7", partNumber: "ACT-LIN-LINAK", name: "Linak LA31 High-Torque Lift Actuator", category: "Motors & Actuators", vanId: "van-103", vanName: "Van 103", technicianName: "David Chen", qtyOnHand: 1, parLevel: 2, unitCost: 320, retailPrice: 560, binLocation: "BIN-A2" },
  { id: "vs-8", partNumber: "HAR-SEAT-4PT", name: "Bodypoint 4-Point Padded Hip Belt", category: "Hardware & Cables", vanId: "van-103", vanName: "Van 103", technicianName: "David Chen", qtyOnHand: 3, parLevel: 3, unitCost: 42, retailPrice: 78, binLocation: "BIN-B1" },
];

const INITIAL_CATALOG: CatalogPart[] = [
  { id: "cat-1", partNumber: "BAT-12V-55AH", name: "12V 55Ah Gel Cell Deep Cycle Battery", manufacturer: "MK Battery", category: "Batteries", warehouseStock: 24, totalVanStock: 8, minThreshold: 15, unitCost: 110, retailPrice: 185, status: "In Stock" },
  { id: "cat-2", partNumber: "JOY-VR2-4K", name: "PG Drives VR2 4-Key Joystick Controller", manufacturer: "Curtiss-Wright", category: "Electronics", warehouseStock: 6, totalVanStock: 3, minThreshold: 5, unitCost: 245, retailPrice: 420, status: "In Stock" },
  { id: "cat-3", partNumber: "MOT-INV-TDX", name: "Invacare TDX SP2 4-Pole Motor/Gearbox LH", manufacturer: "Invacare", category: "Motors & Actuators", warehouseStock: 2, totalVanStock: 1, minThreshold: 3, unitCost: 480, retailPrice: 790, status: "Low Stock" },
  { id: "cat-4", partNumber: "TIR-14X3-FOAM", name: "14x3 Foam-Filled Drive Tire (Grey)", manufacturer: "Primo Primo", category: "Tires & Casters", warehouseStock: 32, totalVanStock: 12, minThreshold: 20, unitCost: 55, retailPrice: 95, status: "In Stock" },
  { id: "cat-5", partNumber: "BIO-CAL-SEN-01", name: "O2 Flow Sensor Transducer Kit", manufacturer: "Philips Healthcare", category: "Biomedical", warehouseStock: 4, totalVanStock: 5, minThreshold: 6, unitCost: 180, retailPrice: 290, status: "Low Stock" },
  { id: "cat-6", partNumber: "ACT-LIN-LINAK", name: "Linak LA31 High-Torque Lift Actuator", manufacturer: "Linak Inc", category: "Motors & Actuators", warehouseStock: 1, totalVanStock: 2, minThreshold: 4, unitCost: 320, retailPrice: 560, status: "Critical" },
  { id: "cat-7", partNumber: "BIO-BATT-LION", name: "Stryker Smart Power 14.4V Lithium Pack", manufacturer: "Stryker Medical", category: "Biomedical", warehouseStock: 8, totalVanStock: 4, minThreshold: 5, unitCost: 310, retailPrice: 520, status: "In Stock" },
];

const INITIAL_INSTALLED: InstalledPart[] = [
  { id: "inst-1", workOrderId: "WO-2026-8812", technicianName: "Marcus Vance", equipmentModel: "Permobil M300 Corpus", serialNumber: "M3-948102-OH", partNumber: "BAT-12V-55AH", partName: "12V 55Ah Gel Cell Deep Cycle Battery", qty: 2, installedDate: "Today at 09:30 AM", unitPrice: 185, warrantyStatus: "Billable to Customer" },
  { id: "inst-2", workOrderId: "WO-2026-8809", technicianName: "Elena Rostova", equipmentModel: "Philips IntelliVue MX450", serialNumber: "MX-22019-US", partNumber: "BIO-CAL-SEN-01", partName: "O2 Flow Sensor Transducer Kit", qty: 1, installedDate: "Yesterday", unitPrice: 290, warrantyStatus: "Manufacturer Warranty" },
  { id: "inst-3", workOrderId: "WO-2026-8795", technicianName: "David Chen", equipmentModel: "Hoyer Advance Electric Lift", serialNumber: "HY-881203", partNumber: "ACT-LIN-LINAK", partName: "Linak LA31 High-Torque Lift Actuator", qty: 1, installedDate: "2 days ago", unitPrice: 560, warrantyStatus: "RMA Return" },
  { id: "inst-4", workOrderId: "WO-2026-8782", technicianName: "Marcus Vance", equipmentModel: "Pride Quantum Edge 3", serialNumber: "QE3-559124", partNumber: "JOY-VR2-4K", partName: "PG Drives VR2 4-Key Joystick Controller", qty: 1, installedDate: "3 days ago", unitPrice: 420, warrantyStatus: "Billable to Customer" },
];

const INITIAL_POS: PurchaseOrder[] = [
  { id: "po-1", poNumber: "PO-77401", vendor: "MK Battery Inc.", partNumber: "BAT-12V-55AH", partName: "12V 55Ah Gel Cell Deep Cycle Battery", qty: 20, totalCost: 2200, status: "Shipped", trackingNumber: "1Z9999999999999991", orderDate: "Oct 28, 2026" },
  { id: "po-2", poNumber: "PO-77395", vendor: "Invacare Parts Direct", partNumber: "MOT-INV-TDX", partName: "Invacare TDX SP2 4-Pole Motor LH", qty: 4, totalCost: 1920, status: "Ordered", trackingNumber: "Awaiting Carrier Pickup", orderDate: "Oct 29, 2026" },
  { id: "po-3", poNumber: "RMA-0412", vendor: "Linak Americas", partNumber: "ACT-LIN-LINAK", partName: "Linak LA31 Actuator (Defective Core)", qty: 1, totalCost: 320, status: "RMA Pending", trackingNumber: "RMA-LNK-884102", orderDate: "Oct 27, 2026" },
  { id: "po-4", poNumber: "PO-77380", vendor: "Curtiss-Wright Controls", partNumber: "JOY-VR2-4K", partName: "PG Drives VR2 4-Key Joystick", qty: 6, totalCost: 1470, status: "Received", trackingNumber: "DELIVERED-FDX-4910", orderDate: "Oct 24, 2026" },
];

export function PartsInventoryCenter() {
  const [selectedVan, setSelectedVan] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vanStock, setVanStock] = useState<VanStockItem[]>(INITIAL_VAN_STOCK);
  const [catalog, setCatalog] = useState<CatalogPart[]>(INITIAL_CATALOG);
  const [installedList, setInstalledList] = useState<InstalledPart[]>(INITIAL_INSTALLED);
  const [poList, setPoList] = useState<PurchaseOrder[]>(INITIAL_POS);

  // Dialog States
  const [isAddPartOpen, setIsAddPartOpen] = useState(false);
  const [isAdjustStockOpen, setIsAdjustStockOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [selectedPartForAdjustment, setSelectedPartForAdjustment] = useState<VanStockItem | null>(null);

  // Form states
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartName, setNewPartName] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newCategory, setNewCategory] = useState<CatalogPart["category"]>("Electronics");
  const [newUnitCost, setNewUnitCost] = useState("120");
  const [newRetailPrice, setNewRetailPrice] = useState("195");
  const [newStockQty, setNewStockQty] = useState("10");

  const [adjustmentQty, setAdjustmentQty] = useState("1");
  const [adjustmentReason, setAdjustmentReason] = useState("Restock replenishment from hub");

  const [transferTargetVan, setTransferTargetVan] = useState("van-102");
  const [transferQty, setTransferQty] = useState("1");

  // Filtering van stock
  const filteredVanStock = vanStock.filter((item) => {
    const matchesVan = selectedVan === "all" || item.vanId === selectedVan;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesSearch =
      item.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.technicianName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesVan && matchesCategory && matchesSearch;
  });

  // Filtering catalog
  const filteredCatalog = catalog.filter((item) => {
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesSearch =
      item.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.manufacturer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // KPI calculations
  const totalStockValue = vanStock.reduce((acc, curr) => acc + curr.qtyOnHand * curr.unitCost, 0);
  const lowStockCount = vanStock.filter((i) => i.qtyOnHand < i.parLevel).length;
  const criticalCatalogCount = catalog.filter((c) => c.status === "Critical" || c.status === "Low Stock").length;

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNumber || !newPartName) {
      toast.error("Please enter both Part Number and Name");
      return;
    }
    const newCatalogItem: CatalogPart = {
      id: `cat-${Date.now()}`,
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
    toast.success(`Part ${newCatalogItem.partNumber} added to master catalog`);
    setNewPartNumber("");
    setNewPartName("");
  };

  const handleAdjustStock = () => {
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
    toast.success(`Stock for ${selectedPartForAdjustment.partNumber} updated (${qtyChange > 0 ? `+${qtyChange}` : qtyChange})`);
  };

  const handleTransferStock = () => {
    if (!selectedPartForAdjustment) return;
    const qty = parseInt(transferQty) || 1;
    if (selectedPartForAdjustment.qtyOnHand < qty) {
      toast.error("Insufficient stock on source van for transfer");
      return;
    }
    const targetVanObj = INITIAL_VANS.find((v) => v.id === transferTargetVan);
    // Deduct from source
    setVanStock((prev) =>
      prev.map((item) => {
        if (item.id === selectedPartForAdjustment.id) {
          return { ...item, qtyOnHand: item.qtyOnHand - qty };
        }
        return item;
      }),
    );
    setIsTransferOpen(false);
    toast.success(`Transferred ${qty}x ${selectedPartForAdjustment.partNumber} to ${targetVanObj?.code || transferTargetVan}`);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Parts & Inventory</h1>
            <Badge className="bg-cyan-700 hover:bg-cyan-800 text-white font-semibold">Live Stock</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Van stock allocations, parts catalog, technician job usage, and RMA warranty tracking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              toast.info("Exporting Inventory Manifest (CSV)...");
              setTimeout(() => toast.success("Inventory manifest downloaded"), 800);
            }}
            className="cursor-pointer"
          >
            <Download className="mr-1.5 size-4" /> Export Stock
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddPartOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            <Plus className="mr-1.5 size-4" /> Add New Part
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Total Van Stock Value</CardTitle>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Boxes className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">${totalStockValue.toLocaleString()}</div>
            <p className="text-xs text-slate-500 mt-1">Across 3 service vans + hub</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Active Service Vans</CardTitle>
            <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600"><Truck className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">3 Vans Active</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">Avg 82% par readiness</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Van Low-Stock Alerts</CardTitle>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-amber-700">{lowStockCount} Items</div>
            <p className="text-xs text-amber-600 mt-1">Below minimum par threshold</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">Open POs & RMAs</CardTitle>
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><RotateCcw className="size-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-slate-900">{poList.length} Active</div>
            <p className="text-xs text-slate-500 mt-1">1 RMA warranty claim pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="van-stock" className="space-y-4">
        <TabsList className="bg-slate-100 p-1">
          <TabsTrigger value="van-stock" className="flex items-center gap-1.5">
            <Truck className="size-4" /> Technician Van Stock
          </TabsTrigger>
          <TabsTrigger value="catalog" className="flex items-center gap-1.5">
            <Boxes className="size-4" /> Master Parts Catalog
          </TabsTrigger>
          <TabsTrigger value="installed" className="flex items-center gap-1.5">
            <Wrench className="size-4" /> Installed on Work Orders
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center gap-1.5">
            <PackageCheck className="size-4" /> Purchase Orders & RMAs
          </TabsTrigger>
        </TabsList>

        {/* 1. VAN STOCK TAB */}
        <TabsContent value="van-stock" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Van Inventory & Mobile Par Levels</CardTitle>
                  <CardDescription className="text-xs">
                    Inspect stock carried inside each technician vehicle to ensure first-time fix capability.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-48">
                    <Select value={selectedVan} onValueChange={setSelectedVan}>
                      <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-300">
                        <SelectValue placeholder="All Vehicles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Service Vehicles</SelectItem>
                        <SelectItem value="van-101">Van 101 · Marcus Vance</SelectItem>
                        <SelectItem value="van-102">Van 102 · Elena Rostova</SelectItem>
                        <SelectItem value="van-103">Van 103 · David Chen</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-8 text-xs bg-slate-50 border-slate-300">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="Batteries">Batteries</SelectItem>
                        <SelectItem value="Electronics">Electronics</SelectItem>
                        <SelectItem value="Motors & Actuators">Motors & Actuators</SelectItem>
                        <SelectItem value="Tires & Casters">Tires & Casters</SelectItem>
                        <SelectItem value="Biomedical">Biomedical</SelectItem>
                        <SelectItem value="Hardware & Cables">Hardware & Cables</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2 size-3.5 text-slate-400" />
                    <Input
                      placeholder="Search part # or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 w-48 pl-8 text-xs bg-slate-50 border-slate-300"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Part Number & Description</th>
                      <th className="py-2.5 px-3">Vehicle / Tech</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Bin Loc</th>
                      <th className="py-2.5 px-3 text-center">On Hand / Par</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Retail</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVanStock.map((item) => {
                      const isLow = item.qtyOnHand < item.parLevel;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-blue-700">{item.partNumber}</div>
                            <div className="text-slate-800 font-medium text-[11px] truncate max-w-xs">{item.name}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-slate-900">{item.vanName}</span>
                            <span className="block text-[10px] text-slate-500">{item.technicianName}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 font-medium">
                              {item.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{item.binLocation}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`font-bold ${isLow ? "text-amber-700" : "text-slate-900"}`}>
                              {item.qtyOnHand}
                            </span>
                            <span className="text-slate-400 text-[10px]"> / {item.parLevel}</span>
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 font-mono">${item.unitCost.toFixed(2)}</td>
                          <td className="py-3 px-3 text-right font-bold text-slate-800 font-mono">${item.retailPrice.toFixed(2)}</td>
                          <td className="py-3 px-3 text-center">
                            {isLow ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                                Low Stock
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]">
                                Optimal
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-slate-700"
                                onClick={() => {
                                  setSelectedPartForAdjustment(item);
                                  setIsAdjustStockOpen(true);
                                }}
                              >
                                Adjust
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px] px-2 text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  setSelectedPartForAdjustment(item);
                                  setIsTransferOpen(true);
                                }}
                              >
                                Transfer
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. MASTER CATALOG TAB */}
        <TabsContent value="catalog" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Master Parts Catalog & Central Warehouse</CardTitle>
                  <CardDescription className="text-xs">
                    Comprehensive parts catalog with warehouse reserves and minimum replenishment thresholds.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setIsAddPartOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white cursor-pointer h-8 text-xs"
                  >
                    <Plus className="mr-1 size-3.5" /> Add Part
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Part # & Name</th>
                      <th className="py-2.5 px-3">Manufacturer</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-center">Warehouse</th>
                      <th className="py-2.5 px-3 text-center">In Vans</th>
                      <th className="py-2.5 px-3 text-right">Cost</th>
                      <th className="py-2.5 px-3 text-right">Retail Price</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Quick Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCatalog.map((part) => (
                      <tr key={part.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-blue-700">{part.partNumber}</span>
                          <span className="block text-slate-800 font-medium text-[11px] truncate max-w-sm">{part.name}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{part.manufacturer}</td>
                        <td className="py-3 px-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 font-medium">
                            {part.category}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">{part.warehouseStock} units</td>
                        <td className="py-3 px-3 text-center font-medium text-slate-600">{part.totalVanStock} units</td>
                        <td className="py-3 px-3 text-right text-slate-600 font-mono">${part.unitCost.toFixed(2)}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">${part.retailPrice.toFixed(2)}</td>
                        <td className="py-3 px-3 text-center">
                          {part.status === "In Stock" && (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px]">
                              In Stock
                            </Badge>
                          )}
                          {part.status === "Low Stock" && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                              Low Stock
                            </Badge>
                          )}
                          {part.status === "Critical" && (
                            <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800 text-[10px]">
                              Critical
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] px-2 text-cyan-700 hover:bg-cyan-50"
                            onClick={() => {
                              toast.success(`Purchase Requisition created for 5x ${part.partNumber} from ${part.manufacturer}`);
                            }}
                          >
                            <PackagePlus className="mr-1 size-3" /> Reorder
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. INSTALLED ON WORK ORDERS */}
        <TabsContent value="installed" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Installed Parts & Work Order Correlation</CardTitle>
                  <CardDescription className="text-xs">
                    Audit trail connecting parts used in the field to specific work orders, equipment models, and serial numbers.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                  {installedList.length} Consumed Parts Logged
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Work Order #</th>
                      <th className="py-2.5 px-3">Equipment & Serial</th>
                      <th className="py-2.5 px-3">Installed Part</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3">Technician</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Billed Amount</th>
                      <th className="py-2.5 px-4 text-center">Warranty & Billing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {installedList.map((inst) => (
                      <tr key={inst.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{inst.workOrderId}</td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-900">{inst.equipmentModel}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">SN: {inst.serialNumber}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono text-slate-700 font-bold">{inst.partNumber}</span>
                          <span className="block text-[11px] text-slate-600 truncate max-w-xs">{inst.partName}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">{inst.qty}</td>
                        <td className="py-3 px-3 font-medium text-slate-700">{inst.technicianName}</td>
                        <td className="py-3 px-3 text-slate-500">{inst.installedDate}</td>
                        <td className="py-3 px-3 text-right font-bold text-slate-900 font-mono">
                          ${(inst.qty * inst.unitPrice).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {inst.warrantyStatus === "Manufacturer Warranty" && (
                            <Badge className="bg-emerald-600 text-white text-[10px]">Mfg Warranty</Badge>
                          )}
                          {inst.warrantyStatus === "Billable to Customer" && (
                            <Badge className="bg-blue-600 text-white text-[10px]">Customer Billed</Badge>
                          )}
                          {inst.warrantyStatus === "RMA Return" && (
                            <Badge className="bg-purple-600 text-white text-[10px]">RMA Return</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. PURCHASE ORDERS & RMAS */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="border-slate-200 bg-white shadow-2xs">
            <CardHeader className="p-4 border-b">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Purchase Orders & Manufacturer RMA Claims</CardTitle>
                  <CardDescription className="text-xs">
                    Track supplier orders from Invacare, Pride, Philips, and Linak, plus warranty core returns.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toast.success("Draft PO initiated. Ready for vendor submission.")}
                  className="cursor-pointer h-8 text-xs"
                >
                  <Plus className="mr-1 size-3.5" /> Create PO
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">PO / RMA #</th>
                      <th className="py-2.5 px-3">Vendor</th>
                      <th className="py-2.5 px-3">Item Ordered / Claimed</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Total Cost</th>
                      <th className="py-2.5 px-3">Order Date</th>
                      <th className="py-2.5 px-3">Carrier / Tracking</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {poList.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">{po.poNumber}</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">{po.vendor}</td>
                        <td className="py-3 px-3">
                          <span className="font-mono text-slate-700 font-bold">{po.partNumber}</span>
                          <span className="block text-[10px] text-slate-500">{po.partName}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-800">{po.qty}</td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">${po.totalCost.toFixed(2)}</td>
                        <td className="py-3 px-3 text-slate-500">{po.orderDate}</td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-600 truncate max-w-xs">{po.trackingNumber}</td>
                        <td className="py-3 px-3 text-center">
                          {po.status === "Received" && <Badge className="bg-emerald-600 text-white text-[10px]">Received</Badge>}
                          {po.status === "Shipped" && <Badge className="bg-blue-600 text-white text-[10px]">In Transit</Badge>}
                          {po.status === "Ordered" && <Badge className="bg-amber-600 text-white text-[10px]">Ordered</Badge>}
                          {po.status === "RMA Pending" && <Badge className="bg-purple-600 text-white text-[10px]">RMA Pending</Badge>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {po.status === "Shipped" ? (
                            <Button
                              size="sm"
                              className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => {
                                setPoList((prev) =>
                                  prev.map((item) => (item.id === po.id ? { ...item, status: "Received" } : item)),
                                );
                                toast.success(`Stock from ${po.poNumber} checked into central warehouse!`);
                              }}
                            >
                              Receive
                            </Button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Archived</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIALOG: ADD NEW PART */}
      <Dialog open={isAddPartOpen} onOpenChange={setIsAddPartOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Part to Catalog</DialogTitle>
            <DialogDescription>Define a new replacement component, OEM number, and pricing parameters.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddPart} className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Part Number (SKU)</Label>
              <Input
                placeholder="e.g. MOT-LIN-24V"
                value={newPartNumber}
                onChange={(e) => setNewPartNumber(e.target.value)}
                required
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Part Name & Description</Label>
              <Input
                placeholder="e.g. 24V Heavy Duty Power Actuator"
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                required
                className="h-8 text-xs mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Manufacturer</Label>
                <Input
                  placeholder="e.g. Invacare / Permobil"
                  value={newManufacturer}
                  onChange={(e) => setNewManufacturer(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={newCategory} onValueChange={(val: any) => setNewCategory(val)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Batteries">Batteries</SelectItem>
                    <SelectItem value="Electronics">Electronics</SelectItem>
                    <SelectItem value="Motors & Actuators">Motors & Actuators</SelectItem>
                    <SelectItem value="Tires & Casters">Tires & Casters</SelectItem>
                    <SelectItem value="Biomedical">Biomedical</SelectItem>
                    <SelectItem value="Hardware & Cables">Hardware & Cables</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs font-semibold">Unit Cost ($)</Label>
                <Input
                  type="number"
                  value={newUnitCost}
                  onChange={(e) => setNewUnitCost(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Retail Price ($)</Label>
                <Input
                  type="number"
                  value={newRetailPrice}
                  onChange={(e) => setNewRetailPrice(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Initial Warehouse</Label>
                <Input
                  type="number"
                  value={newStockQty}
                  onChange={(e) => setNewStockQty(e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddPartOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Save Part
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: ADJUST STOCK */}
      <Dialog open={isAdjustStockOpen} onOpenChange={setIsAdjustStockOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Van Stock</DialogTitle>
            <DialogDescription>
              {selectedPartForAdjustment?.partNumber} ({selectedPartForAdjustment?.vanName})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Current Stock on Hand</Label>
              <p className="text-lg font-bold text-slate-800">{selectedPartForAdjustment?.qtyOnHand} units</p>
            </div>
            <div>
              <Label className="text-xs font-semibold">Adjustment Quantity (+ to add, - to reduce)</Label>
              <Input
                type="number"
                value={adjustmentQty}
                onChange={(e) => setAdjustmentQty(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold">Reason for Adjustment</Label>
              <Input
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAdjustStockOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdjustStock} className="bg-blue-600 text-white">
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: TRANSFER STOCK */}
      <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Stock Between Vehicles</DialogTitle>
            <DialogDescription>
              Transfer {selectedPartForAdjustment?.partNumber} from {selectedPartForAdjustment?.vanName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold">Destination Van</Label>
              <Select value={transferTargetVan} onValueChange={setTransferTargetVan}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="van-101">Van 101 · Marcus Vance</SelectItem>
                  <SelectItem value="van-102">Van 102 · Elena Rostova</SelectItem>
                  <SelectItem value="van-103">Van 103 · David Chen</SelectItem>
                  <SelectItem value="warehouse">Central Warehouse (Westerville)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Quantity to Move</Label>
              <Input
                type="number"
                min="1"
                max={selectedPartForAdjustment?.qtyOnHand || 1}
                value={transferQty}
                onChange={(e) => setTransferQty(e.target.value)}
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsTransferOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleTransferStock} className="bg-blue-600 text-white">
              Confirm Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
