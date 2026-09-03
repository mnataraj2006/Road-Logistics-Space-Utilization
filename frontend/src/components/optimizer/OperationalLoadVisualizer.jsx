import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import {
  Box,
  Layers,
  MapPin,
  Truck,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  CheckCircle2,
  AlertTriangle,
  Move,
  RotateCw,
  Compass,
  ArrowRight,
  Eye,
  Play,
  Filter,
  ShieldCheck,
  Ruler,
  Navigation,
  X,
  Lock,
  Flame,
  Layers3
} from 'lucide-react';
import {
  AUTHORITATIVE_TRUCK,
  DESTINATION_PALETTES,
  normalizeCanonicalPlacements,
  getActiveSegmentCargo,
  validateAuthoritativePlacements,
  validatePackageWithinTruck
} from './canonicalPlacement';
import Trailer2DView from './Trailer2DView';

/**
 * OperationalLoadVisualizer
 *
 * Authoritative 3D Volumetric Digital Twin & 2D CAD Engineering Load Visualizer:
 *
 * 1. Single Authoritative Placement Source:
 *    - All physical dimensions, volume, GVWR, and 3D placement coordinates come directly
 *      from the optimizer's canonical load plan.
 * 2. Physical World Coordinates:
 *    - 1 World Unit = 1.0 Meter.
 *    - X axis = [0, truckLength] (0 = Front Cabin/Bulkhead, truckLength = Rear Doors/Access).
 *    - Y axis = [0, truckWidth] (Left wall to Right wall).
 *    - Z axis = [0, truckHeight] (Floor z=0 to Roof z=truckHeight).
 * 3. Transparent Trailer Shell with 1m floor grid, front tractor cabin, and rear door access frame.
 * 4. Interactive 3D Raycasting & Synchronized Package Inspector.
 * 5. Route Segment Physical Presence Filter & LIFO Door Access Path Raycast.
 */
const OperationalLoadVisualizer = ({
  tripId = 'TRIP-EXP-01',
  vehicleId = 'TN-01',
  routeId = 'CHN-BLR-EXP',
  truckSpecs,
  truckDimensions,
  truckCapacity,
  assignments = [],
  unassigned = [],
  stops = ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
  currentStop = 'Chennai',
  nextStop = 'Kanchipuram',
  currentStopIndex = 0,
  loadPlanStatus = 'OPTIMIZED',
  isLocked = false,
  optimizationResult
}) => {
  const [viewMode, setViewMode] = useState('3D'); // '3D' | '2D'
  const [selectedSegment, setSelectedSegment] = useState(0); // 0 = First hop (e.g. Chennai -> Kanchipuram), or 'ALL'
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mouseScreenPos, setMouseScreenPos] = useState({ x: 0, y: 0 });

  // Feature Toggles
  const [showDimensions, setShowDimensions] = useState(true);
  const [showAccessPath, setShowAccessPath] = useState(true);

  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const cargoMeshesRef = useRef([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseVectorRef = useRef(new THREE.Vector2());

  const controlsRef = useRef({
    isDragging: false,
    dragButton: 0,
    previousMousePosition: { x: 0, y: 0 },
    spherical: { radius: 24, theta: Math.PI / 4.2, phi: Math.PI / 3.2 },
    target: new THREE.Vector3(0, 1.2, 0)
  });

  // ── 1. Authoritative Truck Dimensions Resolution ──
  const rawDims = truckSpecs?.dimensions || truckDimensions || {};
  const truckLength = Number(rawDims.length || truckSpecs?.interiorLength || AUTHORITATIVE_TRUCK.length);
  const truckWidth = Number(rawDims.width || truckSpecs?.interiorWidth || AUTHORITATIVE_TRUCK.width);
  const truckHeight = Number(rawDims.height || truckSpecs?.interiorHeight || AUTHORITATIVE_TRUCK.height);

  const truckVolume = Number(
    truckSpecs?.capacityVolume || truckCapacity?.volume || AUTHORITATIVE_TRUCK.capacityVolume
  );
  const truckWeight = Number(
    truckSpecs?.capacityWeight || truckCapacity?.weight || AUTHORITATIVE_TRUCK.capacityWeight
  );

  const resolvedStops = useMemo(() => {
    if (Array.isArray(stops) && stops.length > 0) return stops;
    return ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];
  }, [stops]);

  // ── 2. Canonical Load Plan Normalization ──
  const canonicalItems = useMemo(() => {
    return normalizeCanonicalPlacements(
      assignments,
      { length: truckLength, width: truckWidth, height: truckHeight },
      resolvedStops
    );
  }, [assignments, truckLength, truckWidth, truckHeight, resolvedStops]);

  // ── 3. Active Cargo for Current Segment ──
  const activeItems = useMemo(() => {
    return getActiveSegmentCargo(canonicalItems, selectedSegment);
  }, [canonicalItems, selectedSegment]);

  // ── 4. Authoritative Validation ──
  const validation = useMemo(() => {
    return validateAuthoritativePlacements(
      canonicalItems,
      { length: truckLength, width: truckWidth, height: truckHeight },
      resolvedStops
    );
  }, [canonicalItems, truckLength, truckWidth, truckHeight, resolvedStops]);

  // ── 4B. Strict Pre-Render Physical Boundary Filter & Quarantine ──
  // Under NO circumstances may a package outside the interior loading volume be rendered in 3D.
  const { physicallyValidActiveItems, quarantinedActiveItems } = useMemo(() => {
    const valid = [];
    const quarantined = [];
    activeItems.forEach(item => {
      const check = validatePackageWithinTruck({
        position: { x: item.x, y: item.y, z: item.z },
        dimensions: { dx: item.dx, dy: item.dy, dz: item.dz },
        truckDimensions: { length: truckLength, width: truckWidth, height: truckHeight }
      });
      if (check.valid) {
        valid.push(item);
      } else {
        quarantined.push({ item, violations: check.violations });
      }
    });
    return { physicallyValidActiveItems: valid, quarantinedActiveItems: quarantined };
  }, [activeItems, truckLength, truckWidth, truckHeight]);

  useEffect(() => {
    if (quarantinedActiveItems.length > 0) {
      console.error('[DigitalTwin] Quarantined invalid packages exceeding trailer physical bounds:', {
        count: quarantinedActiveItems.length,
        items: quarantinedActiveItems.map(q => ({
          shipmentId: q.item.shipmentId,
          position: { x: q.item.x, y: q.item.y, z: q.item.z },
          dimensions: { dx: q.item.dx, dy: q.item.dy, dz: q.item.dz },
          violations: q.violations
        })),
        truck: { length: truckLength, width: truckWidth, height: truckHeight }
      });
    }
  }, [quarantinedActiveItems, truckLength, truckWidth, truckHeight]);

  // ── 5. Segment Telemetry Metrics ──
  const currentTotalVolume = useMemo(() => {
    return physicallyValidActiveItems.reduce((sum, it) => sum + it.volume, 0);
  }, [physicallyValidActiveItems]);

  const currentTotalWeight = useMemo(() => {
    return physicallyValidActiveItems.reduce((sum, it) => sum + it.weight, 0);
  }, [physicallyValidActiveItems]);

  const volumeUtilizationPct = truckVolume > 0 ? ((currentTotalVolume / truckVolume) * 100).toFixed(1) : 0;
  const weightUtilizationPct = truckWeight > 0 ? ((currentTotalWeight / truckWeight) * 100).toFixed(1) : 0;
  const volumeHeadroom = Math.max(0, truckVolume - currentTotalVolume).toFixed(3);
  const weightHeadroom = Math.max(0, truckWeight - currentTotalWeight);

  const maxStackHeight = useMemo(() => {
    if (activeItems.length === 0) return 0;
    return Math.max(...activeItems.map(it => it.z + it.dz));
  }, [activeItems]);
  const verticalHeadroom = Math.max(0, truckHeight - maxStackHeight).toFixed(2);

  // Route Segments Definition
  const routeSegments = useMemo(() => {
    const segs = [];
    for (let i = 0; i < resolvedStops.length - 1; i++) {
      segs.push({
        index: i,
        fromStop: resolvedStops[i],
        toStop: resolvedStops[i + 1],
        label: `${resolvedStops[i]} → ${resolvedStops[i + 1]}`
      });
    }
    return segs;
  }, [resolvedStops]);

  // ── 6. Three.js 3D Viewport Setup ──
  useEffect(() => {
    if (viewMode !== '3D' || !mountRef.current) return;

    // A. Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a101f);
    sceneRef.current = scene;

    // B. Camera setup
    const aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    cameraRef.current = camera;

    // C. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // D. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(25, 35, 20);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fillLight.position.set(-25, 15, -20);
    scene.add(fillLight);

    const rearAccessLight = new THREE.DirectionalLight(0xf59e0b, 0.6);
    rearAccessLight.position.set(20, 10, 0);
    scene.add(rearAccessLight);

    // E. 1-Meter Floor Grid
    const gridHelper = new THREE.GridHelper(30, 30, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // F. Truck Structure
    const halfL = truckLength / 2;
    const halfW = truckWidth / 2;
    const halfH = truckHeight / 2;
    const truckGroup = new THREE.Group();

    // Solid Floor
    const floorGeo = new THREE.BoxGeometry(truckLength, 0.12, truckWidth);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6, metalness: 0.4 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 0.06, 0);
    floorMesh.receiveShadow = true;
    truckGroup.add(floorMesh);

    // Transparent Cutaway Shell
    const shellGeo = new THREE.BoxGeometry(truckLength, truckHeight, truckWidth);
    const shellEdges = new THREE.EdgesGeometry(shellGeo);
    const shellLineMat = new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 2 });
    const shellWireframe = new THREE.LineSegments(shellEdges, shellLineMat);
    shellWireframe.position.set(0, halfH + 0.12, 0);
    truckGroup.add(shellWireframe);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x334155,
      transparent: true,
      opacity: 0.12,
      roughness: 0.1,
      transmission: 0.7,
      thickness: 0.5
    });
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(truckLength, truckHeight), glassMat);
    backWall.position.set(0, halfH + 0.12, -halfW);
    truckGroup.add(backWall);

    const roofMesh = new THREE.Mesh(new THREE.PlaneGeometry(truckLength, truckWidth), glassMat);
    roofMesh.rotation.x = Math.PI / 2;
    roofMesh.position.set(0, truckHeight + 0.12, 0);
    truckGroup.add(roofMesh);

    // Front Cabin (Tractor Unit at Left / X < 0)
    const cabGroup = new THREE.Group();
    const cabGeo = new THREE.BoxGeometry(3.0, 3.4, truckWidth + 0.1);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 });
    const cabMesh = new THREE.Mesh(cabGeo, cabMat);
    cabMesh.position.set(-halfL - 1.6, 1.8, 0);
    cabMesh.castShadow = true;
    cabGroup.add(cabMesh);

    const windGeo = new THREE.BoxGeometry(1.2, 1.4, truckWidth);
    const windMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.1, metalness: 0.8 });
    const windMesh = new THREE.Mesh(windGeo, windMat);
    windMesh.position.set(-halfL - 2.6, 2.3, 0);
    cabGroup.add(windMesh);

    truckGroup.add(cabGroup);

    // Rear Doors Access Frame
    const doorFrameGeo = new THREE.BoxGeometry(0.15, truckHeight, truckWidth);
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5, metalness: 0.5 });
    const doorFrame = new THREE.Mesh(doorFrameGeo, doorFrameMat);
    doorFrame.position.set(halfL + 0.08, halfH + 0.12, 0);
    truckGroup.add(doorFrame);

    const accessZoneGeo = new THREE.PlaneGeometry(2.0, truckWidth);
    const accessZoneMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.4 });
    const accessZone = new THREE.Mesh(accessZoneGeo, accessZoneMat);
    accessZone.rotation.x = -Math.PI / 2;
    accessZone.position.set(halfL + 1.1, 0.01, 0);
    truckGroup.add(accessZone);

    scene.add(truckGroup);

    // G. 3D Cargo Boxes Placement (Strictly Validated Packages Only)
    const cargoGroup = new THREE.Group();
    const meshes = [];

    physicallyValidActiveItems.forEach((item) => {
      const palette = DESTINATION_PALETTES[item.destColorIndex % DESTINATION_PALETTES.length];
      const isSelected = selectedItem?.shipmentId === item.shipmentId;
      const isConflict = validation.accessibilityConflicts.some(c => c.blockedItem === item.shipmentId);

      // Exact Three.js coordinates
      const posX = -halfL + item.x + (item.dx / 2);
      const posY = 0.12 + item.z + (item.dz / 2);
      const posZ = -halfW + item.y + (item.dy / 2);

      const geo = new THREE.BoxGeometry(item.dx, item.dz, item.dy);
      const boxColor = isConflict ? 0xef4444 : item.fragile ? 0xdc2626 : palette.hex;

      const mat = new THREE.MeshStandardMaterial({
        color: boxColor,
        roughness: 0.35,
        metalness: 0.15,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { shipment: item };

      // Edges Wireframe
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0xffffff : item.fragile ? 0xff0000 : 0x0f172a,
        linewidth: isSelected ? 3 : 2
      });
      const wire = new THREE.LineSegments(edges, lineMat);
      mesh.add(wire);

      // LIFO Unload Path Raycast to Rear Doors (X = halfL)
      if (showAccessPath || isSelected) {
        const rayStart = new THREE.Vector3(posX + item.dx / 2, posY, posZ);
        const rayEnd = new THREE.Vector3(halfL + 0.1, posY, posZ);
        const rayGeo = new THREE.BufferGeometry().setFromPoints([rayStart, rayEnd]);
        const rayMat = new THREE.LineDashedMaterial({
          color: isConflict ? 0xef4444 : 0xf59e0b,
          dashSize: 0.3,
          gapSize: 0.15,
          linewidth: 2
        });
        const rayLine = new THREE.Line(rayGeo, rayMat);
        rayLine.computeLineDistances();
        cargoGroup.add(rayLine);
      }

      cargoGroup.add(mesh);
      meshes.push(mesh);
    });

    scene.add(cargoGroup);
    cargoMeshesRef.current = meshes;

    // H. Dimension Calipers Overlay
    if (showDimensions) {
      const lineMatDim = new THREE.LineDashedMaterial({ color: 0x94a3b8, dashSize: 0.25, gapSize: 0.12, linewidth: 1 });

      const lenPoints = [
        new THREE.Vector3(-halfL, truckHeight + 0.5, halfW + 0.3),
        new THREE.Vector3(halfL, truckHeight + 0.5, halfW + 0.3)
      ];
      const lenGeo = new THREE.BufferGeometry().setFromPoints(lenPoints);
      const lenLine = new THREE.Line(lenGeo, lineMatDim);
      lenLine.computeLineDistances();
      scene.add(lenLine);

      const hgtPoints = [
        new THREE.Vector3(halfL + 0.6, 0.12, halfW + 0.3),
        new THREE.Vector3(halfL + 0.6, truckHeight + 0.12, halfW + 0.3)
      ];
      const hgtGeo = new THREE.BufferGeometry().setFromPoints(hgtPoints);
      const hgtLine = new THREE.Line(hgtGeo, lineMatDim);
      hgtLine.computeLineDistances();
      scene.add(hgtLine);
    }

    // I. Camera Update & Animation Loop
    const updateCamera = () => {
      const { radius, theta, phi } = controlsRef.current.spherical;
      const target = controlsRef.current.target;

      camera.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = target.y + radius * Math.cos(phi);
      camera.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.lookAt(target);
    };

    updateCamera();

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !renderer || !camera) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, [viewMode, physicallyValidActiveItems, selectedItem, showDimensions, showAccessPath, truckLength, truckWidth, truckHeight, validation]);

  // ── Mouse & Orbit Controls ──
  const handleMouseDown = (e) => {
    controlsRef.current.isDragging = true;
    controlsRef.current.dragButton = e.button;
    controlsRef.current.previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    setMouseScreenPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (controlsRef.current.isDragging) {
      const deltaX = e.clientX - controlsRef.current.previousMousePosition.x;
      const deltaY = e.clientY - controlsRef.current.previousMousePosition.y;

      if (controlsRef.current.dragButton === 0) {
        // Orbit Rotate
        controlsRef.current.spherical.theta -= deltaX * 0.005;
        controlsRef.current.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.02, controlsRef.current.spherical.phi - deltaY * 0.005));
      } else if (controlsRef.current.dragButton === 2) {
        // Pan
        controlsRef.current.target.x -= deltaX * 0.02;
        controlsRef.current.target.z += deltaY * 0.02;
      }

      controlsRef.current.previousMousePosition = { x: e.clientX, y: e.clientY };

      const { radius, theta, phi } = controlsRef.current.spherical;
      const target = controlsRef.current.target;
      cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      cameraRef.current.position.y = target.y + radius * Math.cos(phi);
      cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      cameraRef.current.lookAt(target);
    } else {
      // Hover Raycasting
      mouseVectorRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseVectorRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseVectorRef.current, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(cargoMeshesRef.current, false);

      if (intersects.length > 0) {
        setHoveredItem(intersects[0].object.userData.shipment);
      } else {
        setHoveredItem(null);
      }
    }
  };

  const handleMouseUp = () => {
    controlsRef.current.isDragging = false;
  };

  const handleClick = (e) => {
    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    mouseVectorRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVectorRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseVectorRef.current, cameraRef.current);
    const intersects = raycasterRef.current.intersectObjects(cargoMeshesRef.current, false);

    if (intersects.length > 0) {
      setSelectedItem(intersects[0].object.userData.shipment);
    } else {
      setSelectedItem(null);
    }
  };

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      controlsRef.current.spherical.radius = Math.max(8, Math.min(60, controlsRef.current.spherical.radius + e.deltaY * 0.03));
      const { radius, theta, phi } = controlsRef.current.spherical;
      const target = controlsRef.current.target;
      cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      cameraRef.current.position.y = target.y + radius * Math.cos(phi);
      cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      cameraRef.current.lookAt(target);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const applyCameraPreset = (preset) => {
    if (!cameraRef.current) return;
    controlsRef.current.target.set(0, 1.2, 0);

    if (preset === 'ISOMETRIC') {
      controlsRef.current.spherical = { radius: 24, theta: Math.PI / 4.2, phi: Math.PI / 3.2 };
    } else if (preset === 'REAR_ACCESS') {
      // Direct view from rear doors towards front cabin
      controlsRef.current.spherical = { radius: 18, theta: 0, phi: Math.PI / 2.3 };
    } else if (preset === 'TOP_DOWN') {
      controlsRef.current.spherical = { radius: 24, theta: 0, phi: 0.1 };
    } else if (preset === 'SIDE_ELEVATION') {
      controlsRef.current.spherical = { radius: 24, theta: Math.PI / 2, phi: Math.PI / 2.2 };
    }

    const { radius, theta, phi } = controlsRef.current.spherical;
    const target = controlsRef.current.target;
    cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.position.y = target.y + radius * Math.cos(phi);
    cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.lookAt(target);
  };

  // Check if visualization data is in an unavailable state
  const isUnavailable = useMemo(() => {
    return optimizationResult && Array.isArray(optimizationResult.assignments) && optimizationResult.assignments.length > 0 && canonicalItems.length === 0;
  }, [optimizationResult, canonicalItems]);

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl space-y-4 p-5 text-slate-100 font-sans">
      {/* ── TOP ACTION BAR: VIEW SWITCHER & CORRIDOR SEGMENT SELECTOR ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        {/* Left: View Mode Tabs */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('3D')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border ${
              viewMode === '3D'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Box className="w-4 h-4" />
            <span>3D Volumetric Digital Twin</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('2D')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-2 cursor-pointer border ${
              viewMode === '2D'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-950'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-850'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2D CAD Floorplan &amp; Elevation</span>
          </button>
        </div>

        {/* Right: Route Corridor Segment Physical Selector */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl">
          <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span>Corridor Leg:</span>
          </span>

          {routeSegments.map((seg) => (
            <button
              key={seg.index}
              type="button"
              onClick={() => setSelectedSegment(seg.index)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
                selectedSegment === seg.index
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-xs'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              #{seg.index + 1}: {seg.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSelectedSegment('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer border ${
              selectedSegment === 'ALL'
                ? 'bg-blue-600 text-white border-blue-500 font-black shadow-xs'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            Full Corridor
          </button>
        </div>
      </div>

      {/* ── ERROR STATE: LOAD PLAN VISUALIZATION UNAVAILABLE ── */}
      {isUnavailable && (
        <div className="p-6 bg-red-950/80 border border-red-800 rounded-2xl text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
          <h4 className="text-sm font-black text-red-200">LOAD PLAN VISUALIZATION UNAVAILABLE</h4>
          <p className="text-xs text-red-300">
            Authoritative 3D placement coordinates are missing or corrupted for this load plan. Please re-run the optimization to generate valid spatial coordinates.
          </p>
        </div>
      )}

      {/* ── OPERATIONAL QUARANTINE WARNING BANNER ── */}
      {quarantinedActiveItems.length > 0 && (
        <div className="p-4 bg-amber-950/70 border border-amber-500/60 rounded-2xl flex items-start gap-3 shadow-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold text-amber-200">
              {quarantinedActiveItems.length} package(s) exceeded truck physical boundaries and were excluded from rendering
            </h4>
            <p className="text-amber-300/90 text-[11px]">
              To prevent physical corruption and packages extending outside trailer doors, quarantined items are excluded from the 3D Digital Twin and 2D CAD views.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {quarantinedActiveItems.map(q => (
                <span key={q.item.shipmentId} className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[10px] bg-amber-900/60 text-amber-200 border border-amber-600/50">
                  {q.item.shipmentId}: {q.violations.map(v => `${v.boundary} (${v.axis}) +${v.overflow}m`).join(', ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN VIEWPORT (3D DIGITAL TWIN OR 2D CAD SCHEMATIC) ── */}
      {!isUnavailable && viewMode === '3D' ? (
        <div className="relative w-full h-[540px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
          {/* Three.js Canvas Mount */}
          <div
            ref={mountRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            onContextMenu={(e) => e.preventDefault()}
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Direction Orientation Markers & Plan vs Physical Badges */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <div className="bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs font-black text-slate-200 shadow-lg backdrop-blur-md flex items-center gap-1.5">
              <span>← FRONT CABIN (X = 0m)</span>
            </div>
            <div className="bg-slate-900/90 border border-emerald-600/80 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-300 shadow-lg backdrop-blur-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>LOCKED PLAN: {canonicalItems.length} Pkgs</span>
              <span className="text-slate-500">•</span>
              <span>ONBOARD: {physicallyValidActiveItems.length} Pkgs</span>
              {quarantinedActiveItems.length > 0 && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="text-red-400 font-bold">QUARANTINED: {quarantinedActiveItems.length} Pkgs</span>
                </>
              )}
              {canonicalItems.length > activeItems.length && (
                <>
                  <span className="text-slate-500">•</span>
                  <span className="text-amber-400">FUTURE: {canonicalItems.length - activeItems.length} Pkgs</span>
                </>
              )}
            </div>
          </div>

          <div className="absolute top-4 right-4 z-10">
            <div className="bg-slate-900/90 border border-amber-500/80 px-3.5 py-1.5 rounded-xl text-xs font-black text-amber-400 shadow-lg backdrop-blur-md flex items-center gap-1.5">
              <span>REAR DOORS (ACCESS: X = {truckLength.toFixed(1)}m) →</span>
            </div>
          </div>

          {/* Hover Tooltip Overlay */}
          {hoveredItem && !controlsRef.current.isDragging && (
            <div
              style={{
                left: `${Math.min(mountRef.current?.clientWidth - 200 || 300, Math.max(10, mouseScreenPos.x + 12))}px`,
                top: `${Math.min(mountRef.current?.clientHeight - 100 || 300, Math.max(10, mouseScreenPos.y + 12))}px`
              }}
              className="absolute z-30 pointer-events-none bg-slate-900/95 border border-slate-700 p-2.5 rounded-xl shadow-xl backdrop-blur-md text-xs space-y-0.5"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <strong className="text-white font-mono">{hoveredItem.shipmentId}</strong>
              </div>
              <span className="text-[10px] text-amber-300 block">→ {hoveredItem.delivery} (Stop #{hoveredItem.deliveryIndex + 1})</span>
              <span className="text-[10px] text-slate-300 block font-mono">
                {hoveredItem.dx}m × {hoveredItem.dy}m × {hoveredItem.dz}m • {hoveredItem.volume} m³ • {hoveredItem.weight.toLocaleString()} kg
              </span>
            </div>
          )}

          {/* Segment Empty State Banner (Strict Plan vs Physical distinction) */}
          {activeItems.length === 0 && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
              <div className="text-center px-6 py-5 bg-slate-950/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl space-y-2 max-w-md">
                <div className="flex items-center justify-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-950 text-blue-300 border border-blue-800">
                    LOCKED PLAN: {canonicalItems.length} PACKAGES
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-slate-800 text-slate-300 border border-slate-700">
                    CURRENT PHYSICAL LOAD: 0 PACKAGES
                  </span>
                </div>
                <span className="text-sm font-black text-slate-100 block">
                  {selectedSegment === 'ALL'
                    ? 'No physical cargo currently loaded on trailer.'
                    : `No cargo physically onboard during segment #${Number(selectedSegment) + 1} (${routeSegments[selectedSegment]?.label}).`}
                </span>
                <p className="text-xs text-slate-400">
                  {selectedSegment === 0 || selectedSegment === 'ALL'
                    ? `Awaiting loading operation at origin stop (${resolvedStops[0] || 'Chennai'}).`
                    : `Planned cargo for downstream stops will be loaded when the vehicle arrives at their designated origin.`}
                </p>
                <div className="text-[10px] text-emerald-400/90 font-mono pt-1 border-t border-slate-800/80 flex justify-between">
                  <span>Capacity: {truckLength.toFixed(2)}m × {truckWidth.toFixed(2)}m × {truckHeight.toFixed(2)}m ({truckVolume.toFixed(1)} m³)</span>
                  <span>Payload: {truckWeight.toLocaleString()} kg</span>
                </div>
              </div>
            </div>
          )}

          {/* Bottom HUD: Live Physical Telemetry */}
          <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 text-xs font-bold text-slate-300 bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-800 backdrop-blur-md shadow-lg">
            <span className="text-emerald-400">Trailer: {truckLength.toFixed(2)}m × {truckWidth.toFixed(2)}m × {truckHeight.toFixed(2)}m</span>
            <span>•</span>
            <span className="text-slate-300">Vol: {currentTotalVolume.toFixed(1)} / {truckVolume.toFixed(1)} m³ ({volumeUtilizationPct}%)</span>
            <span>•</span>
            <span className="text-blue-400">Free: {volumeHeadroom} m³</span>
          </div>

          {/* Bottom Right Controls */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 backdrop-blur-md shadow-lg">
            <button
              onClick={() => applyCameraPreset('ISOMETRIC')}
              className="px-2.5 py-1 text-xs font-black text-emerald-400 hover:text-emerald-300 rounded-lg hover:bg-slate-800 transition cursor-pointer border-none bg-transparent"
              title="Isometric 3D View"
            >
              Isometric
            </button>
            <button
              onClick={() => applyCameraPreset('REAR_ACCESS')}
              className="px-2.5 py-1 text-xs font-black text-amber-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition cursor-pointer border-none bg-transparent"
              title="Rear Door LIFO View"
            >
              Rear Doors (LIFO)
            </button>
            <button
              onClick={() => applyCameraPreset('TOP_DOWN')}
              className="px-2.5 py-1 text-xs font-black text-blue-400 hover:text-blue-300 rounded-lg hover:bg-slate-800 transition cursor-pointer border-none bg-transparent"
              title="Top Down 3D"
            >
              Top-Down
            </button>
          </div>
        </div>
      ) : !isUnavailable && (
        <Trailer2DView
          truckDimensions={{ length: truckLength, width: truckWidth, height: truckHeight }}
          truckCapacity={{ volume: truckVolume, weight: truckWeight }}
          canonicalItems={canonicalItems}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
          selectedSegment={selectedSegment}
          onSelectSegment={setSelectedSegment}
          stops={resolvedStops}
          currentStop={currentStop}
          showUnloadPath={showAccessPath}
          isLocked={isLocked}
        />
      )}

      {/* ── 3D / 2D CLICK INSPECTOR CARD ── */}
      {selectedItem && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-3 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <h4 className="text-xs font-black font-mono tracking-wide">{selectedItem.shipmentId}</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800">
                Route: {selectedItem.pickup} → {selectedItem.delivery}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-950 text-blue-300 border border-blue-800">
                Status: {selectedItem.status}
              </span>
              {selectedItem.fragile && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-red-950 text-red-300 border border-red-800 flex items-center gap-1">
                  <Flame className="w-3 h-3" /> FRAGILE
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="text-slate-400 hover:text-white text-xs cursor-pointer border-none bg-transparent"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">Physical Dimensions (L × W × H)</span>
              <strong className="text-slate-100 font-mono">{selectedItem.dx}m × {selectedItem.dy}m × {selectedItem.dz}m</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">Volume &amp; Weight</span>
              <strong className="text-emerald-400 font-mono">{selectedItem.volume} m³ • {selectedItem.weight.toLocaleString()} kg</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">Coordinates (X, Y, Z)</span>
              <strong className="text-slate-100 font-mono">X:{selectedItem.x.toFixed(2)}m, Y:{selectedItem.y.toFixed(2)}m, Z:{selectedItem.z.toFixed(2)}m</strong>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold">LIFO Unloading Clearance</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Unloadable at {selectedItem.delivery}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 4-CARD UNIFIED TELEMETRY HUD ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 text-xs">
        {/* CARD 1: CARGO SUMMARY */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Box className="w-3.5 h-3.5" />
            ONBOARD CARGO ({activeItems.length})
          </h4>
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
            {activeItems.map((it) => {
              const palette = DESTINATION_PALETTES[it.destColorIndex % DESTINATION_PALETTES.length];
              return (
                <div
                  key={it.shipmentId}
                  onClick={() => setSelectedItem(it)}
                  className="flex items-center justify-between text-[11px] cursor-pointer hover:bg-slate-800/50 p-1 rounded-lg transition"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: palette.bg }} />
                    <div>
                      <span className="font-mono font-bold text-white block">{it.shipmentId}</span>
                      <span className="text-[10px] block" style={{ color: palette.dest }}>{it.pickup} → {it.delivery}</span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-400 font-semibold">
                    <span className="block text-slate-200 font-bold">{it.volume} m³</span>
                    <span>{it.weight.toLocaleString()} kg</span>
                  </div>
                </div>
              );
            })}
            {activeItems.length === 0 && (
              <span className="text-[11px] text-slate-500 italic block py-2">No cargo packages currently occupying trailer.</span>
            )}
          </div>
        </div>

        {/* CARD 2: UTILIZATION & HEADROOM */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Layers className="w-3.5 h-3.5" />
            UTILIZATION &amp; HEADROOM
          </h4>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">VOLUME OCCUPIED</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">FREE HEADROOM</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-white">{volumeUtilizationPct}%</span>
              <span className="text-sm font-black text-emerald-400">{volumeHeadroom} m³</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, volumeUtilizationPct)}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-400 block">{currentTotalVolume.toFixed(1)} / {truckVolume.toFixed(1)} m³</span>
          </div>

          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase">PAYLOAD WEIGHT</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase">FREE PAYLOAD</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black text-white">{weightUtilizationPct}%</span>
              <span className="text-sm font-black text-emerald-400">{weightHeadroom.toLocaleString()} kg</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, weightUtilizationPct)}%` }}
              />
            </div>
            <span className="text-[9px] text-slate-400 block">{currentTotalWeight.toLocaleString()} / {truckWeight.toLocaleString()} kg</span>
          </div>
        </div>

        {/* CARD 3: MULTI-STOP UNLOAD SEQUENCE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <MapPin className="w-3.5 h-3.5" />
            LIFO REAR ACCESS
          </h4>
          <div className="space-y-2 max-h-[140px] overflow-y-auto">
            {resolvedStops.slice(1).map((st, i) => {
              const palette = DESTINATION_PALETTES[i % DESTINATION_PALETTES.length];
              const isFinal = i === resolvedStops.length - 2;
              return (
                <div key={st} className="flex items-start gap-2 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: palette.bg }} />
                  <div>
                    <span className="font-bold text-slate-200 block">Deliver to {st}</span>
                    <span className="text-[10px] text-slate-400 block">
                      {isFinal ? 'Terminus Destination' : `Stop #${i + 2} in corridor`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CARD 4: NAVIGATION CONTROLS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-md">
          <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Move className="w-3.5 h-3.5" />
            CAMERA &amp; CONTROLS
          </h4>
          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <RotateCw className="w-3 h-3 text-emerald-400" /> Orbit Rotate
              </span>
              <span className="font-semibold text-slate-200">Left-click drag</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Move className="w-3 h-3 text-emerald-400" /> Pan Scene
              </span>
              <span className="font-semibold text-slate-200">Right-click drag</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <ZoomIn className="w-3 h-3 text-emerald-400" /> Zoom In / Out
              </span>
              <span className="font-semibold text-slate-200">Scroll wheel</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Compass className="w-3 h-3 text-emerald-400" /> Inspect Box
              </span>
              <span className="font-semibold text-slate-200">Left-click</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationalLoadVisualizer;
