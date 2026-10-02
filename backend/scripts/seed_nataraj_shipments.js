import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:5000/api';

// Reference date: Current simulation time
const NOW = new Date();
const dateOffset = (days) => {
  const d = new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
};

/**
 * 28 Varied Shipments for Logistics Manager Nataraj
 * Spanning Tamil Nadu routes, diverse dimensions, realistic weights,
 * varied package quantities, cargo types, priorities, and statuses.
 */
const SHIPMENT_DEFINITIONS = [
  // -------------------------------------------------------------
  // CORRIDOR 1: Chennai -> Coimbatore (TN-CHN-CBE)
  // Stops: Chennai -> Sriperumbudur -> Vellore -> Salem -> Erode -> Tiruppur -> Coimbatore
  // -------------------------------------------------------------
  {
    code: 'CHN-CBE-AUTO',
    cargoDescription: 'Precision Engine Valves & Transmission Gears',
    cargoCategory: 'AUTOMOTIVE',
    packageCount: 8,
    length: 1.20,
    width: 0.80,
    height: 0.60,
    volume: 4.61, // 8 * 0.576 m3
    weight: 1450,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 2000,
    priority: 'URGENT',
    routeId: 'TN-CHN-CBE',
    fromStop: 'Chennai',
    toStop: 'Coimbatore',
    vehicleId: 'TN-22-CD-7834',
    date: dateOffset(0), // Today
    invoiceNumber: 'INV-TN-001',
    invoiceValue: 145000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'CHN-ERD-ELEC',
    cargoDescription: 'Distribution Transformer Bushings & Core Assemblies',
    cargoCategory: 'ELECTRONICS',
    packageCount: 6,
    length: 1.00,
    width: 0.60,
    height: 0.60,
    volume: 2.16, // 6 * 0.360 m3
    weight: 680,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'EXPRESS',
    routeId: 'TN-CHN-CBE',
    fromStop: 'Chennai',
    toStop: 'Erode',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(2),
    invoiceNumber: 'INV-TN-002',
    invoiceValue: 88000,
    desiredStatus: 'BOOKED'
  },
  {
    code: 'SLM-CBE-GAR',
    cargoDescription: 'Export Quality Combed Cotton Knitwear Garments',
    cargoCategory: 'TEXTILE',
    packageCount: 25,
    length: 0.80,
    width: 0.50,
    height: 0.40,
    volume: 4.00, // 25 * 0.160 m3
    weight: 550,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 800,
    priority: 'STANDARD',
    routeId: 'TN-CHN-CBE',
    fromStop: 'Salem',
    toStop: 'Coimbatore',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(1),
    invoiceNumber: 'INV-TN-003',
    invoiceValue: 62000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 2: Chennai -> Salem (TN-CHN-SLM)
  // Stops: Chennai -> Villupuram -> Ulundurpet -> Attur -> Salem
  // -------------------------------------------------------------
  {
    code: 'CHN-SLM-FOOD',
    cargoDescription: 'Refined Virgin Coconut Oil Drums',
    cargoCategory: 'PERISHABLE',
    packageCount: 30,
    length: 0.60,
    width: 0.40,
    height: 0.40,
    volume: 2.88, // 30 * 0.096 m3
    weight: 920,
    fragile: false,
    stackable: true,
    allowRotation: false,
    maxStackWeight: 1200,
    priority: 'STANDARD',
    routeId: 'TN-CHN-SLM',
    fromStop: 'Chennai',
    toStop: 'Salem',
    vehicleId: 'TN-23-EF-5012',
    date: dateOffset(-1),
    invoiceNumber: 'INV-TN-004',
    invoiceValue: 74000,
    desiredStatus: 'IN_TRANSIT'
  },
  {
    code: 'CHN-VLP-AUTO',
    cargoDescription: 'Heavy-Duty Commercial Vehicle Alternators',
    cargoCategory: 'AUTOMOTIVE',
    packageCount: 5,
    length: 1.10,
    width: 0.70,
    height: 0.50,
    volume: 1.93,
    weight: 520,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 900,
    priority: 'EXPRESS',
    routeId: 'TN-CHN-SLM',
    fromStop: 'Chennai',
    toStop: 'Villupuram',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(3),
    invoiceNumber: 'INV-TN-005',
    invoiceValue: 56000,
    desiredStatus: 'PENDING'
  },

  // -------------------------------------------------------------
  // CORRIDOR 3: Chennai -> Hosur (TN-CHN-HSR)
  // Stops: Chennai -> Sriperumbudur -> Vellore -> Ambur -> Krishnagiri -> Hosur
  // -------------------------------------------------------------
  {
    code: 'CHN-HSR-BATT',
    cargoDescription: 'EV Lithium-Ion Battery Module Packs',
    cargoCategory: 'ELECTRONICS',
    packageCount: 4,
    length: 1.20,
    width: 0.90,
    height: 0.70,
    volume: 3.02,
    weight: 1100,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'URGENT',
    routeId: 'TN-CHN-HSR',
    fromStop: 'Chennai',
    toStop: 'Hosur',
    vehicleId: 'TN-70-WX-1425',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-006',
    invoiceValue: 240000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'SPB-HSR-MACH',
    cargoDescription: 'CNC High-Speed Milling Tooling & Spindles',
    cargoCategory: 'GENERAL',
    packageCount: 3,
    length: 1.50,
    width: 0.80,
    height: 0.70,
    volume: 2.52,
    weight: 840,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1500,
    priority: 'EXPRESS',
    routeId: 'TN-CHN-HSR',
    fromStop: 'Sriperumbudur',
    toStop: 'Hosur',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(1),
    invoiceNumber: 'INV-TN-007',
    invoiceValue: 115000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 4: Chennai -> Sriperumbudur (TN-CHN-SPB)
  // -------------------------------------------------------------
  {
    code: 'CHN-SPB-PACK',
    cargoDescription: 'High-Tensile Polymer Strapping Coils & Packaging',
    cargoCategory: 'GENERAL',
    packageCount: 40,
    length: 0.60,
    width: 0.40,
    height: 0.40,
    volume: 3.84,
    weight: 640,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 800,
    priority: 'STANDARD',
    routeId: 'TN-CHN-SPB',
    fromStop: 'Chennai',
    toStop: 'Sriperumbudur',
    vehicleId: 'TN-01-AB-4521',
    date: dateOffset(-3),
    invoiceNumber: 'INV-TN-008',
    invoiceValue: 45000,
    desiredStatus: 'DELIVERED'
  },
  {
    code: 'CHN-SPB-CHAS',
    cargoDescription: 'Automobile Stamped Structural Chassis Brackets',
    cargoCategory: 'AUTOMOTIVE',
    packageCount: 12,
    length: 1.00,
    width: 0.50,
    height: 0.50,
    volume: 3.00,
    weight: 960,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1600,
    priority: 'STANDARD',
    routeId: 'TN-CHN-SPB',
    fromStop: 'Chennai',
    toStop: 'Sriperumbudur',
    vehicleId: 'TN-01-AB-4521',
    date: dateOffset(-2),
    invoiceNumber: 'INV-TN-009',
    invoiceValue: 78000,
    desiredStatus: 'DELIVERED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 5: Sriperumbudur -> Coimbatore (TN-SPB-CBE)
  // Stops: Sriperumbudur -> Kanchipuram -> Vellore -> Dharmapuri -> Salem -> Erode -> Coimbatore
  // -------------------------------------------------------------
  {
    code: 'SPB-CBE-ROBOT', // Challenging large dimensional obstacle test
    cargoDescription: 'Automated 6-Axis Industrial Robotic Arm & Controller',
    cargoCategory: 'GENERAL',
    packageCount: 2,
    length: 2.50,
    width: 1.20,
    height: 1.20,
    volume: 7.20, // 2 * 3.60 m3
    weight: 1850,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'URGENT',
    routeId: 'TN-SPB-CBE',
    fromStop: 'Sriperumbudur',
    toStop: 'Coimbatore',
    vehicleId: 'TN-66-ST-9083',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-010',
    invoiceValue: 420000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'VEL-SLM-SPICE',
    cargoDescription: 'Organic Turmeric & Native Spices Export Sacks',
    cargoCategory: 'PERISHABLE',
    packageCount: 35,
    length: 0.70,
    width: 0.40,
    height: 0.30,
    volume: 2.94,
    weight: 1050,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1400,
    priority: 'STANDARD',
    routeId: 'TN-SPB-CBE',
    fromStop: 'Vellore',
    toStop: 'Salem',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(4),
    invoiceNumber: 'INV-TN-011',
    invoiceValue: 53000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 6: Coimbatore -> Madurai (TN-CBE-MDU)
  // Stops: Coimbatore -> Palladam -> Dharapuram -> Oddanchatram -> Dindigul -> Madurai
  // -------------------------------------------------------------
  {
    code: 'CBE-MDU-YARN',
    cargoDescription: 'Loom-Spun Organic Cotton Ring Yarn Cartons',
    cargoCategory: 'TEXTILE',
    packageCount: 20,
    length: 0.90,
    width: 0.60,
    height: 0.50,
    volume: 5.40,
    weight: 1200,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1500,
    priority: 'EXPRESS',
    routeId: 'TN-CBE-MDU',
    fromStop: 'Coimbatore',
    toStop: 'Madurai',
    vehicleId: 'TN-38-EF-2190',
    date: dateOffset(-1),
    invoiceNumber: 'INV-TN-012',
    invoiceValue: 95000,
    desiredStatus: 'IN_TRANSIT'
  },
  {
    code: 'DHA-DGL-DAIRY',
    cargoDescription: 'Sterilized Ghee & Butter Dairy Cartons',
    cargoCategory: 'PERISHABLE',
    packageCount: 45,
    length: 0.50,
    width: 0.35,
    height: 0.30,
    volume: 2.36,
    weight: 675,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 900,
    priority: 'STANDARD',
    routeId: 'TN-CBE-MDU',
    fromStop: 'Dharapuram',
    toStop: 'Dindigul',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(1),
    invoiceNumber: 'INV-TN-013',
    invoiceValue: 48000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 7: Erode -> Tiruppur (TN-ERD-TPR)
  // Stops: Erode -> Perundurai -> Vijayamangalam -> Avinashi -> Tiruppur
  // -------------------------------------------------------------
  {
    code: 'ERD-TPR-FABRIC',
    cargoDescription: 'Bleached Mercerized Cotton Fabric Rolls',
    cargoCategory: 'TEXTILE',
    packageCount: 14,
    length: 1.20,
    width: 0.80,
    height: 0.50,
    volume: 6.72,
    weight: 1150,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1600,
    priority: 'STANDARD',
    routeId: 'TN-ERD-TPR',
    fromStop: 'Erode',
    toStop: 'Tiruppur',
    vehicleId: 'TN-39-GH-6412',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-014',
    invoiceValue: 82000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'PER-TPR-CARTON', // Challenging low-density volumetric test
    cargoDescription: 'Triple-Wall Corrugated Garment Packaging Cartons',
    cargoCategory: 'GENERAL',
    packageCount: 22,
    length: 1.00,
    width: 0.60,
    height: 0.60,
    volume: 7.92, // High volume
    weight: 380, // Very low weight
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 500,
    priority: 'STANDARD',
    routeId: 'TN-ERD-TPR',
    fromStop: 'Perundurai',
    toStop: 'Tiruppur',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(2),
    invoiceNumber: 'INV-TN-015',
    invoiceValue: 34000,
    desiredStatus: 'PENDING'
  },

  // -------------------------------------------------------------
  // CORRIDOR 8: Chennai -> Tiruchirappalli (TN-CHN-TRY)
  // Stops: Chennai -> Chengalpattu -> Tindivanam -> Villupuram -> Perambalur -> Tiruchirappalli
  // -------------------------------------------------------------
  {
    code: 'CHN-TRY-METER',
    cargoDescription: 'Smart Digital Grid Electricity Meters & IoT Gateways',
    cargoCategory: 'ELECTRONICS',
    packageCount: 36,
    length: 0.40,
    width: 0.30,
    height: 0.30,
    volume: 1.30,
    weight: 320,
    fragile: true,
    stackable: true,
    allowRotation: false,
    maxStackWeight: 600,
    priority: 'EXPRESS',
    routeId: 'TN-CHN-TRY',
    fromStop: 'Chennai',
    toStop: 'Tiruchirappalli',
    vehicleId: 'TN-45-JK-8931',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-016',
    invoiceValue: 125000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'TIN-TRY-PANEL',
    cargoDescription: 'Modular Electrical Power Distribution Panels',
    cargoCategory: 'ELECTRONICS',
    packageCount: 3,
    length: 1.60,
    width: 0.90,
    height: 0.80,
    volume: 3.46,
    weight: 720,
    fragile: false,
    stackable: true,
    allowRotation: false,
    maxStackWeight: 1000,
    priority: 'URGENT',
    routeId: 'TN-CHN-TRY',
    fromStop: 'Tindivanam',
    toStop: 'Tiruchirappalli',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(3),
    invoiceNumber: 'INV-TN-017',
    invoiceValue: 110000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 9: Tiruchirappalli -> Madurai (TN-TRY-MDU)
  // Stops: Tiruchirappalli -> Manapparai -> Viralimalai -> Melur -> Madurai
  // -------------------------------------------------------------
  {
    code: 'TRY-MDU-SWITCH',
    cargoDescription: 'Substation Vacuum Circuit Breakers & Switchgear',
    cargoCategory: 'ELECTRONICS',
    packageCount: 2,
    length: 1.80,
    width: 1.00,
    height: 0.90,
    volume: 3.24,
    weight: 1180,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'URGENT',
    routeId: 'TN-TRY-MDU',
    fromStop: 'Tiruchirappalli',
    toStop: 'Madurai',
    vehicleId: 'TN-59-QR-4627',
    date: dateOffset(-1),
    invoiceNumber: 'INV-TN-018',
    invoiceValue: 185000,
    desiredStatus: 'IN_TRANSIT'
  },
  {
    code: 'MAN-MDU-SILK',
    cargoDescription: 'Handloom Traditional Silk Sarees & Brocades',
    cargoCategory: 'TEXTILE',
    packageCount: 18,
    length: 0.50,
    width: 0.40,
    height: 0.30,
    volume: 1.08,
    weight: 160,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 400,
    priority: 'STANDARD',
    routeId: 'TN-TRY-MDU',
    fromStop: 'Manapparai',
    toStop: 'Madurai',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(5),
    invoiceNumber: 'INV-TN-019',
    invoiceValue: 92000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 10: Madurai -> Thoothukudi (TN-MDU-TUT)
  // Stops: Madurai -> Virudhunagar -> Sattur -> Kovilpatti -> Thoothukudi
  // -------------------------------------------------------------
  {
    code: 'MDU-TUT-COMP', // High-weight large test
    cargoDescription: 'Heavy Rotary Screw Pneumatic Air Compressors',
    cargoCategory: 'GENERAL',
    packageCount: 3,
    length: 2.00,
    width: 1.00,
    height: 1.00,
    volume: 6.00,
    weight: 1950,
    fragile: false,
    stackable: true,
    allowRotation: false,
    maxStackWeight: 2500,
    priority: 'URGENT',
    routeId: 'TN-MDU-TUT',
    fromStop: 'Madurai',
    toStop: 'Thoothukudi',
    vehicleId: 'TN-58-NP-7148',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-020',
    invoiceValue: 210000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'VIR-KOV-SPICE',
    cargoDescription: 'Processed Roasted Gram & Spicy Seasonings',
    cargoCategory: 'PERISHABLE',
    packageCount: 40,
    length: 0.60,
    width: 0.40,
    height: 0.35,
    volume: 3.36,
    weight: 880,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1100,
    priority: 'STANDARD',
    routeId: 'TN-MDU-TUT',
    fromStop: 'Virudhunagar',
    toStop: 'Kovilpatti',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(2),
    invoiceNumber: 'INV-TN-021',
    invoiceValue: 47000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 11: Thoothukudi -> Tirunelveli (TN-TUT-TNV)
  // Stops: Thoothukudi -> Vagaikulam -> Seithunganallur -> Palayamkottai -> Tirunelveli
  // -------------------------------------------------------------
  {
    code: 'TUT-TNV-SILICA',
    cargoDescription: 'Port Shipping Moisture Adsorbent Silica Gel Bags',
    cargoCategory: 'GENERAL',
    packageCount: 24,
    length: 0.80,
    width: 0.60,
    height: 0.40,
    volume: 4.61,
    weight: 1400,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 1800,
    priority: 'STANDARD',
    routeId: 'TN-TUT-TNV',
    fromStop: 'Thoothukudi',
    toStop: 'Tirunelveli',
    vehicleId: 'TN-69-AB-3751',
    date: dateOffset(-4),
    invoiceNumber: 'INV-TN-022',
    invoiceValue: 58000,
    desiredStatus: 'DELIVERED'
  },
  {
    code: 'TUT-PAL-RADAR',
    cargoDescription: 'Commercial Marine Radar Transceivers & Displays',
    cargoCategory: 'FRAGILE_GLASS',
    packageCount: 4,
    length: 0.90,
    width: 0.70,
    height: 0.50,
    volume: 1.26,
    weight: 190,
    fragile: true,
    stackable: false,
    allowRotation: false,
    maxStackWeight: 0,
    priority: 'EXPRESS',
    routeId: 'TN-TUT-TNV',
    fromStop: 'Thoothukudi',
    toStop: 'Palayamkottai',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(3),
    invoiceNumber: 'INV-TN-023',
    invoiceValue: 175000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 12: Tirunelveli -> Nagercoil (TN-TNV-NGC)
  // Stops: Tirunelveli -> Nanguneri -> Valliyur -> Panagudi -> Nagercoil
  // -------------------------------------------------------------
  {
    code: 'TNV-NGC-TURB',
    cargoDescription: 'Windmill Turbine Hydraulic Pitch Spares',
    cargoCategory: 'GENERAL',
    packageCount: 3,
    length: 1.10,
    width: 0.70,
    height: 0.60,
    volume: 1.39,
    weight: 410,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 800,
    priority: 'URGENT',
    routeId: 'TN-TNV-NGC',
    fromStop: 'Tirunelveli',
    toStop: 'Nagercoil',
    vehicleId: 'TN-72-UV-5319',
    date: dateOffset(0),
    invoiceNumber: 'INV-TN-024',
    invoiceValue: 98000,
    desiredStatus: 'ALLOCATED'
  },
  {
    code: 'VAL-NGC-COIR',
    cargoDescription: 'Coir Geo-Textiles & Natural Fibre Mats',
    cargoCategory: 'TEXTILE',
    packageCount: 16,
    length: 0.70,
    width: 0.50,
    height: 0.40,
    volume: 2.24,
    weight: 220,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 500,
    priority: 'STANDARD',
    routeId: 'TN-TNV-NGC',
    fromStop: 'Valliyur',
    toStop: 'Nagercoil',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(4),
    invoiceNumber: 'INV-TN-025',
    invoiceValue: 29000,
    desiredStatus: 'PENDING'
  },

  // -------------------------------------------------------------
  // CORRIDOR 13: Salem -> Karur (TN-SLM-KRR)
  // Stops: Salem -> Namakkal -> Paramathi Velur -> Karur
  // -------------------------------------------------------------
  {
    code: 'SLM-KRR-STEEL',
    cargoDescription: 'High-Tensile Precision Machined Steel Spindles',
    cargoCategory: 'GENERAL',
    packageCount: 6,
    length: 1.40,
    width: 0.60,
    height: 0.50,
    volume: 2.52,
    weight: 1320,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 2200,
    priority: 'EXPRESS',
    routeId: 'TN-SLM-KRR',
    fromStop: 'Salem',
    toStop: 'Karur',
    vehicleId: 'TN-47-LM-3256',
    date: dateOffset(-2),
    invoiceNumber: 'INV-TN-026',
    invoiceValue: 112000,
    desiredStatus: 'DELIVERED'
  },
  {
    code: 'NAM-KRR-LINEN',
    cargoDescription: 'Export Cotton Damask Bed Linen Cartons',
    cargoCategory: 'TEXTILE',
    packageCount: 28,
    length: 0.80,
    width: 0.50,
    height: 0.40,
    volume: 4.48,
    weight: 590,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 800,
    priority: 'STANDARD',
    routeId: 'TN-SLM-KRR',
    fromStop: 'Namakkal',
    toStop: 'Karur',
    vehicleId: 'UNASSIGNED', // Optimizer Candidate
    date: dateOffset(1),
    invoiceNumber: 'INV-TN-027',
    invoiceValue: 67000,
    desiredStatus: 'BOOKED'
  },

  // -------------------------------------------------------------
  // CORRIDOR 14: Salem -> Erode (TN-SLM-ERD)
  // Stops: Salem -> Sankari -> Bhavani -> Erode
  // -------------------------------------------------------------
  {
    code: 'SLM-ERD-FURN',
    cargoDescription: 'Ergonomic Modular Office Swivel Chairs',
    cargoCategory: 'GENERAL',
    packageCount: 8,
    length: 1.10,
    width: 0.80,
    height: 0.70,
    volume: 4.93,
    weight: 360,
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: 600,
    priority: 'STANDARD',
    routeId: 'TN-SLM-ERD',
    fromStop: 'Salem',
    toStop: 'Erode',
    vehicleId: 'TN-27-YZ-6830',
    date: dateOffset(-1),
    invoiceNumber: 'INV-TN-028',
    invoiceValue: 64000,
    desiredStatus: 'IN_TRANSIT'
  }
];

async function seedShipments() {
  console.log('===============================================================');
  console.log(' SEEDING 28 REALISTIC TAMIL NADU SHIPMENTS FOR NATARAJ');
  console.log(' User: nataraj@gmail.com');
  console.log('===============================================================\n');

  // 1. Authenticate via existing Login API
  console.log('[1/4] Authenticating as Logistics Manager nataraj@gmail.com...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'nataraj@gmail.com', password: 'abcd1234' })
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    throw new Error(`Authentication failed (${loginRes.status}): ${errText}`);
  }

  const loginData = await loginRes.json();
  const token = loginData.token;
  const authHeader = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  };
  console.log(`✓ Authenticated! User ID: ${loginData._id}, Org: ${loginData.companyName}`);

  // 2. Iterate and create each shipment via POST /api/bookings
  console.log('\n[2/4] Creating 28 realistic shipments via POST /api/bookings...');
  const createdRecords = [];

  for (let i = 0; i < SHIPMENT_DEFINITIONS.length; i++) {
    const item = SHIPMENT_DEFINITIONS[i];
    const seq = String(i + 1).padStart(2, '0');

    // Create via standard POST /api/bookings
    const payload = {
      cargoDescription: item.cargoDescription,
      cargoCategory: item.cargoCategory,
      packageCount: item.packageCount,
      length: item.length,
      width: item.width,
      height: item.height,
      volume: item.volume,
      weight: item.weight,
      fragile: item.fragile,
      stackable: item.stackable,
      allowRotation: item.allowRotation,
      maxStackWeight: item.maxStackWeight,
      priority: item.priority,
      routeId: item.routeId,
      fromStop: item.fromStop,
      toStop: item.toStop,
      vehicleId: item.vehicleId,
      date: item.date,
      invoiceNumber: item.invoiceNumber,
      invoiceValue: item.invoiceValue,
      status: item.desiredStatus
    };

    const createRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify(payload)
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      console.error(`✗ [${seq}/28] Failed to create ${item.code}:`, err.message || err);
      throw new Error(`Failed to create shipment ${item.code}`);
    }

    const created = await createRes.json();

    // 3. Update status if non-standard (e.g., DELIVERED, IN_TRANSIT, ALLOCATED) to ensure synchronized status
    if (item.desiredStatus !== 'PENDING' && item.desiredStatus !== 'BOOKED') {
      const updateRes = await fetch(`${API_BASE}/bookings/${created.bookingId}`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify({
          status: item.desiredStatus,
          vehicleId: item.vehicleId
        })
      });
      if (!updateRes.ok) {
        console.warn(`! Could not update status for ${created.bookingId} to ${item.desiredStatus}`);
      }
    }

    createdRecords.push({
      index: i + 1,
      code: item.code,
      bookingId: created.bookingId,
      shipmentId: created.shipmentId,
      route: `${item.fromStop} -> ${item.toStop} (${item.routeId})`,
      category: item.cargoCategory,
      description: item.cargoDescription,
      dimensions: `${item.length}m x ${item.width}m x ${item.height}m`,
      volume: `${item.volume} m³`,
      weight: `${item.weight} kg`,
      packages: item.packageCount,
      priority: item.priority,
      status: item.desiredStatus,
      truck: item.vehicleId
    });

    console.log(
      `✓ [${seq}/28] Created ${created.bookingId} (${created.shipmentId}) | ` +
      `${item.fromStop} -> ${item.toStop} | ${item.cargoCategory} | ` +
      `${item.weight}kg | ${item.volume}m³ | ${item.priority} | ${item.desiredStatus}`
    );
  }

  // 4. Summary & Verification
  console.log('\n[3/4] Fetching all Nataraj shipments from /api/shipments and /api/bookings...');
  const [getBookingsRes, getShipmentsRes] = await Promise.all([
    fetch(`${API_BASE}/bookings`, { headers: authHeader }),
    fetch(`${API_BASE}/shipments`, { headers: authHeader })
  ]);

  const allBookings = await getBookingsRes.json();
  const allShipments = await getShipmentsRes.json();

  console.log(`✓ Active Bookings found for Nataraj: ${Array.isArray(allBookings) ? allBookings.length : 0}`);
  console.log(`✓ Backing Shipments found for Nataraj: ${allShipments.count || allShipments.shipments?.length || 0}`);

  // Summary statistics
  const statusCounts = {};
  const priorityCounts = {};
  const categoryCounts = {};
  const truckCounts = {};

  createdRecords.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    priorityCounts[r.priority] = (priorityCounts[r.priority] || 0) + 1;
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
    truckCounts[r.truck] = (truckCounts[r.truck] || 0) + 1;
  });

  console.log('\n===============================================================');
  console.log(' SEEDING COMPLETED SUCCESSFULLY');
  console.log('===============================================================');
  console.log(`Total Shipments Created: ${createdRecords.length}`);
  console.log('Status Distribution:', JSON.stringify(statusCounts, null, 2));
  console.log('Priority Distribution:', JSON.stringify(priorityCounts, null, 2));
  console.log('Category Distribution:', JSON.stringify(categoryCounts, null, 2));
  console.log('Truck Assignments:', JSON.stringify(truckCounts, null, 2));
}

seedShipments().catch(err => {
  console.error('\n✗ Error during shipment seeding:', err);
  process.exit(1);
});
