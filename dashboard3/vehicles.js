/* Vehicles tab
   - Uses the SAME left filters (date range + collision filters)
   - Adds compact vehicle filters as multi-selects
   - Reads CSVs from: data/collisions_2024.csv, data/casualties_2024.csv, data/vehicles_2024.csv
*/

(() => {
  const fmtInt = d3.format(",");
  const parseDate = d3.timeParse("%d/%m/%Y");

  // Prefer Dashboard 2 tooltip helpers if present
  const tipShow = (window.showTip) ? window.showTip : (html, event) => {
    const tooltip = d3.select("#tooltip");
    tooltip
      .style("opacity", 1)
      .html(html)
      .style("left", (event.clientX + 12) + "px")
      .style("top", (event.clientY + 12) + "px");
  };
  const tipHide = (window.hideTip) ? window.hideTip : () => d3.select("#tooltip").style("opacity", 0);

  // --- Label helpers (same logic as Dashboard 2)
  function sevLabel(code){
    const c = +code;
    if (c === 1) return "Fatal";
    if (c === 2) return "Serious";
    if (c === 3) return "Slight";
    return "Unknown";
  }
  function classLabel(code){
    const c = +code;
    if (c === 1) return "Driver/Rider";
    if (c === 2) return "Passenger";
    if (c === 3) return "Pedestrian";
    return "Unknown";
  }
  function sexLabel(code){
    const c = +code;
    if (c === 1) return "Male";
    if (c === 2) return "Female";
    return "Unknown";
  }
  function ageBandDerived(age){
    const a = +age;
    if (!Number.isFinite(a) || a < 0) return "Unknown";
    if (a <= 15) return "0–15";
    if (a <= 24) return "16–24";
    if (a <= 59) return "25–59";
    return "60+";
  }

  // --- Vehicle grouping (from your Dashboard 1 mapping)
  const vehicleGroups = {
    "1":"Active / Personal","16":"Active / Personal","22":"Active / Personal",
    "2":"Motorcycles","3":"Motorcycles","4":"Motorcycles","5":"Motorcycles","23":"Motorcycles","97":"Motorcycles",
    "103":"Motorcycles","104":"Motorcycles","105":"Motorcycles","106":"Motorcycles",
    "8":"Cars & Taxis","9":"Cars & Taxis","108":"Cars & Taxis","109":"Cars & Taxis",
    "10":"Buses & Minibuses","11":"Buses & Minibuses","110":"Buses & Minibuses",
    "19":"Vans & Goods","20":"Vans & Goods","21":"Vans & Goods","98":"Vans & Goods","113":"Vans & Goods",
    "17":"Special Vehicles","18":"Special Vehicles",
    "90":"Other / Unknown","99":"Other / Unknown"
  };

  const VEH_GROUPS = [
    "Cars & Taxis",
    "Motorcycles",
    "Buses & Minibuses",
    "Vans & Goods",
    "Active / Special / Other"
  ];

  function vehicleGroup(code){
    const c = String(code ?? "").trim();
    const g = vehicleGroups[c];
    if (!g) return "Active / Special / Other";
    if (g === "Cars & Taxis") return g;
    if (g === "Motorcycles") return g;
    if (g === "Buses & Minibuses") return g;
    if (g === "Vans & Goods") return g;
    return "Active / Special / Other";
  }

  function engineBand(cc){
    const v = +cc;
    if (!Number.isFinite(v) || v < 0) return "Unknown";
    if (v <= 100) return "≤100 cc";
    if (v <= 500) return "101–500 cc";
    if (v <= 1000) return "501–1000 cc";
    return ">1000 cc";
  }

  function vehicleAgeBand(age){
    const v = +age;
    if (!Number.isFinite(v) || v < 0) return "Unknown";
    if (v <= 3) return "0–3";
    if (v <= 10) return "4–10";
    if (v <= 20) return "11–20";
    return "21+";
  }

  // Impact code normalization
  const impactLabels = {
    "0":"No impact",
    "1":"Front",
    "2":"Back",
    "3":"Offside",
    "4":"Nearside",
    "unknown":"Unknown"
  };
  function normImpact(code){
    const c = String(code ?? "").trim();
    if (c === "0" || c === "1" || c === "2" || c === "3" || c === "4") return c;
    return "unknown"; // includes 9, -1, blanks, etc.
  }

  // Weather labels (Dashboard 1)
  const weatherLabels = {
    "1":"Fine",
    "2":"Raining",
    "3":"Snowing",
    "4":"Fine + high winds",
    "5":"Raining + high winds",
    "6":"Snowing + high winds",
    "7":"Fog / mist",
    "8":"Other",
    "9":"Unknown"
  };

  // Distance banding
  const distanceBands = [
    {code:"1", label:"0–5 km", pos:1},
    {code:"2", label:"5–10 km", pos:2},
    {code:"3", label:"10–20 km", pos:3},
    {code:"4", label:"20–100 km", pos:4},
    {code:"5", label:"100+ km", pos:5}
  ];

  // --- Vehicles tab state
  const veh = {
    loaded: false,
    collisions: [],
    casualties: [],
    vehicles: [],
    filters: {
      groups: new Set(VEH_GROUPS),
      engines: new Set(["≤100 cc","101–500 cc","501–1000 cc",">1000 cc","Unknown"]),
      ages: new Set(["0–3","4–10","11–20","21+","Unknown"])
    }
  };

  function populateMultiSelect(el, values){
    el.innerHTML = "";
    values.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      opt.selected = true;
      el.appendChild(opt);
    });
  }

  function readSelected(el){
    const s = new Set(Array.from(el.selectedOptions).map(o => o.value));
    return s;
  }

  function selectAll(el){
    Array.from(el.options).forEach(o => (o.selected = true));
  }

  function readBaseFiltersFromDOM(){
    const ds = document.getElementById("dateStart")?.value || "";
    const de = document.getElementById("dateEnd")?.value || "";
    const dateStart = ds ? new Date(ds) : null;
    const dateEnd = de ? new Date(de) : null;

    const police = document.getElementById("selPolice")?.value ?? "All";
    const highway = document.getElementById("selHighway")?.value ?? "All";
    const roadType = document.getElementById("selRoadType")?.value ?? "All";
    const speed = document.getElementById("selSpeed")?.value ?? "All";

    const sex = document.getElementById("selSex")?.value ?? "All";
    const ageBand = document.getElementById("selAgeBand")?.value ?? "All";
    const casClass = document.getElementById("selClass")?.value ?? "All";

    const sevSet = new Set(
      Array.from(document.querySelectorAll("#severityButtons .btn-chip.active"))
        .map(b => b.dataset.sev)
        .filter(Boolean)
    );
    if (sevSet.size === 0) ["Fatal","Serious","Slight"].forEach(s => sevSet.add(s));

    return { dateStart, dateEnd, police, highway, roadType, speed, sex, ageBand, casClass, sevSet };
  }

  function applyBaseCollisionFilters(filters){
    return veh.collisions.filter(d => {
      const dt = d._date;
      if (filters.dateStart && dt && dt < filters.dateStart) return false;
      if (filters.dateEnd && dt && dt > filters.dateEnd) return false;

      if (filters.police !== "All" && String(d.police_force) !== filters.police) return false;
      if (filters.highway !== "All" && String(d.local_authority_highway_current) !== filters.highway) return false;
      if (filters.roadType !== "All" && String(d.road_type) !== filters.roadType) return false;
      if (filters.speed !== "All" && String(d.speed_limit) !== filters.speed) return false;

      return true;
    });
  }

  // --- Charts
  function safeBox(svg){
    const node = svg.node();
    if (!node) return null;
    const {width, height} = node.getBoundingClientRect();
    if (width < 60 || height < 60) return null;
    svg.attr("viewBox", [0,0,width,height]);
    return {width, height};
  }

  function createImpactTreemap(svgSel){
    const svg = d3.select(svgSel);
    const margin = {top: 10, right: 10, bottom: 10, left: 10};

    function render(items){
      const box = safeBox(svg);
      if (!box) return;
      svg.selectAll("*").remove();

      const innerW = box.width - margin.left - margin.right;
      const innerH = box.height - margin.top - margin.bottom;
      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const total = d3.sum(items, d => d.count) || 1;

      const root = d3.hierarchy({
        name: "Impact",
        children: items.map(d => ({name: d.label, code: d.code, value: d.count}))
      })
      .sum(d => d.value)
      .sort((a,b) => (b.value||0) - (a.value||0));

      d3.treemap().size([innerW, innerH]).padding(3).round(true)(root);

      const palette = (d3.schemeTableau10 || []).concat(d3.schemeSet3 || []);
      const color = d3.scaleOrdinal()
        .domain(items.map(d => d.code))
        .range(palette.length ? palette : ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f","#edc949"]);

      const cells = g.selectAll("g.cell")
        .data(root.leaves())
        .join("g")
        .attr("class","cell")
        .attr("transform", d => `translate(${d.x0},${d.y0})`);

      cells.append("rect")
        .attr("width", d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("rx", 10)
        .attr("fill", d => color(d.data.code))
        .attr("stroke", "rgba(0,0,0,.06)")
        .on("mousemove", (event, d) => {
          const pct = (d.data.value / total);
          tipShow(
            `<div><strong>${d.data.name}</strong></div>
             <div>Collisions: ${fmtInt(d.data.value)}</div>
             <div class="muted">Share: ${d3.format(".1%")(pct)}</div>`,
            event
          );
        })
        .on("mouseleave", tipHide);

      cells.append("text")
        .attr("x", 10)
        .attr("y", 18)
        .style("font-weight", 900)
        .style("fill", "white")
        .style("font-size", "12px")
        .text(d => {
          const w = d.x1 - d.x0;
          return w > 90 ? d.data.name : "";
        });

      cells.append("text")
        .attr("x", 10)
        .attr("y", 36)
        .style("font-weight", 900)
        .style("fill", "white")
        .style("font-size", "12px")
        .text(d => fmtInt(d.data.value));
    }

    return { update: render };
  }

  function createWeatherBars(svgSel){
    const svg = d3.select(svgSel);
    const margin = {top: 10, right: 14, bottom: 28, left: 160};

    function render(items){
      const box = safeBox(svg);
      if (!box) return;
      svg.selectAll("*").remove();

      const innerW = box.width - margin.left - margin.right;
      const innerH = box.height - margin.top - margin.bottom;
      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear()
        .domain([0, d3.max(items, d => d.value) || 1]).nice()
        .range([0, innerW]);

      const y = d3.scaleBand()
        .domain(items.map(d => d.key))
        .range([0, innerH])
        .padding(0.22);

      g.append("g")
        .call(d3.axisLeft(y).tickSize(0))
        .call(s => s.selectAll("text").style("font-weight", 800))
        .call(s => s.select(".domain").remove());

      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(fmtInt))
        .call(s => s.select(".domain").remove());

      g.selectAll("rect.bar")
        .data(items, d => d.key)
        .join("rect")
        .attr("class","bar")
        .attr("x", 0)
        .attr("y", d => y(d.key))
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.value))
        .attr("rx", 8)
        .on("mousemove", (event, d) => {
          tipShow(`<div><strong>${d.key}</strong></div><div>Collisions: ${fmtInt(d.value)}</div>`, event);
        })
        .on("mouseleave", tipHide);

      g.selectAll("text.value")
        .data(items, d => d.key)
        .join("text")
        .attr("x", d => x(d.value) + 6)
        .attr("y", d => y(d.key) + y.bandwidth()/2 + 4)
        .style("font-weight", 900)
        .text(d => fmtInt(d.value));
    }

    return { update: render };
  }

  function createDriverAgePie(svgSel){
    const svg = d3.select(svgSel);

    function render(items){
      const box = safeBox(svg);
      if (!box) return;
      svg.selectAll("*").remove();

      const r = Math.min(box.width, box.height) * 0.38;
      const g = svg.append("g").attr("transform", `translate(${box.width/2},${box.height/2})`);

      const total = d3.sum(items, d => d.value) || 1;
      const color = d3.scaleOrdinal()
        .domain(items.map(d => d.key))
        .range(d3.schemeTableau10 || ["#4e79a7","#f28e2b","#e15759","#76b7b2","#59a14f"]);

      const pie = d3.pie().value(d => d.value).sort(null);
      const arc = d3.arc().innerRadius(0).outerRadius(r);

      g.selectAll("path")
        .data(pie(items))
        .join("path")
        .attr("d", arc)
        .attr("fill", d => color(d.data.key))
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .style("opacity", 0.95)
        .on("mousemove", (event, d) => {
          tipShow(
            `<div><strong>${d.data.key}</strong></div>
             <div>Collisions: ${fmtInt(d.data.value)}</div>
             <div class="muted">Share: ${d3.format(".1%")(d.data.value/total)}</div>`,
            event
          );
        })
        .on("mouseleave", tipHide);

      // simple legend
      const legend = svg.append("g").attr("transform", `translate(10,14)`);
      const row = legend.selectAll("g.row")
        .data(items)
        .join("g")
        .attr("class","row")
        .attr("transform", (d,i) => `translate(0,${i*18})`);

      row.append("rect").attr("width", 10).attr("height", 10).attr("rx",2).attr("fill", d => color(d.key));
      row.append("text").attr("x", 14).attr("y", 10).style("font-size","12px").style("font-weight",800).text(d => `${d.key} (${fmtInt(d.value)})`);
    }

    return { update: render };
  }

  function createDistanceLine(svgSel){
    const svg = d3.select(svgSel);
    const margin = {top: 10, right: 14, bottom: 36, left: 64};

    function render(items){
      const box = safeBox(svg);
      if (!box) return;
      svg.selectAll("*").remove();

      const innerW = box.width - margin.left - margin.right;
      const innerH = box.height - margin.top - margin.bottom;
      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const x = d3.scaleLinear().domain([0.5, 5.5]).range([0, innerW]);
      const y = d3.scaleLinear()
        .domain([0, d3.max(items, d => d.count) || 1]).nice()
        .range([innerH, 0]);

      const line = d3.line()
        .x(d => x(d.pos))
        .y(d => y(d.count))
        .curve(d3.curveMonotoneX);

      g.append("path")
        .datum(items)
        .attr("fill", "none")
        .attr("stroke", "rgba(47,58,143,.95)")
        .attr("stroke-width", 3)
        .attr("d", line);

      g.selectAll("circle.dot")
        .data(items, d => d.code)
        .join("circle")
        .attr("class","dot")
        .attr("cx", d => x(d.pos))
        .attr("cy", d => y(d.count))
        .attr("r", 6)
        .attr("fill", "rgba(47,58,143,.95)")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .on("mousemove", (event, d) => {
          tipShow(`<div><strong>${d.label}</strong></div><div>Collisions: ${fmtInt(d.count)}</div>`, event);
        })
        .on("mouseleave", tipHide);

      const xAxis = d3.axisBottom(x)
        .tickValues(distanceBands.map(d => d.pos))
        .tickFormat(pos => distanceBands.find(d => d.pos === pos)?.label ?? "");

      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(xAxis)
        .call(s => s.select(".domain").remove())
        .selectAll("text")
        .style("font-weight", 800)
        .style("font-size", "11px");

      g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(fmtInt))
        .call(s => s.select(".domain").remove())
        .selectAll("text")
        .style("font-weight", 800)
        .style("font-size", "11px");
    }

    return { update: render };
  }

  const charts = {};

  function updateVehicleKpis(vehiclesFiltered){
    const map = new Map(VEH_GROUPS.map(k => [k, new Set()]));
    vehiclesFiltered.forEach(v => {
      const g = vehicleGroup(v.vehicle_type);
      const id = String(v.collision_index);
      if (!map.has(g)) map.set(g, new Set());
      map.get(g).add(id);
    });

    const val = k => fmtInt((map.get(k)?.size) || 0);
    d3.select("#kpiVehCars").text(val("Cars & Taxis"));
    d3.select("#kpiVehMoto").text(val("Motorcycles"));
    d3.select("#kpiVehBus").text(val("Buses & Minibuses"));
    d3.select("#kpiVehVans").text(val("Vans & Goods"));
    d3.select("#kpiVehOther").text(val("Active / Special / Other"));
  }

  function buildImpactData(vehiclesFiltered){
    const byCollision = new Map(); // collision_id -> Set(impact)
    vehiclesFiltered.forEach(v => {
      const id = String(v.collision_index);
      const imp = normImpact(v.first_point_of_impact);
      if (!byCollision.has(id)) byCollision.set(id, new Set());
      byCollision.get(id).add(imp);
    });

    const counts = new Map();
    byCollision.forEach(set => {
      set.forEach(code => counts.set(code, (counts.get(code) || 0) + 1));
    });

    const order = ["1","2","3","4","0","unknown"];
    return order
      .map(code => ({code, label: impactLabels[code], count: counts.get(code) || 0}))
      .filter(d => d.count > 0);
  }

  function buildWeatherData(collisionsForVehicles){
    const counts = d3.rollup(
      collisionsForVehicles,
      v => v.length,
      d => String(d.weather_conditions ?? "9")
    );

    const items = [];
    for (let c = 1; c <= 9; c++){
      const code = String(c);
      const v = counts.get(code) || 0;
      if (v > 0) items.push({ key: weatherLabels[code], value: v });
    }
    // Put Unknown last
    items.sort((a,b) => (a.key === "Unknown") - (b.key === "Unknown") || d3.descending(a.value,b.value));
    return items;
  }

  function buildDriverAgeData(vehiclesFiltered){
    function group(age){
      const a = +age;
      if (!Number.isFinite(a) || a < 0) return "Unknown";
      if (a < 18) return "<18";
      if (a <= 25) return "18–25";
      if (a <= 55) return "25–55";
      return ">55";
    }

    const perCollision = new Map(); // collision -> Set(ageGroup)
    vehiclesFiltered.forEach(v => {
      const id = String(v.collision_index);
      const g = group(v.age_of_driver);
      if (!perCollision.has(id)) perCollision.set(id, new Set());
      perCollision.get(id).add(g);
    });

    const counts = new Map();
    perCollision.forEach(set => set.forEach(k => counts.set(k, (counts.get(k)||0)+1)));

    const order = ["<18","18–25","25–55",">55","Unknown"];
    return order
      .map(k => ({key: k, value: counts.get(k) || 0}))
      .filter(d => d.value > 0);
  }

  function buildDistanceData(casualtiesFiltered){
    // Count unique collisions per band
    const perBand = new Map(distanceBands.map(d => [d.code, new Set()]));
    casualtiesFiltered.forEach(c => {
      const band = String(c.casualty_distance_banding ?? "");
      const id = String(c.collision_index);
      if (perBand.has(band)) perBand.get(band).add(id);
    });

    return distanceBands.map(d => ({
      ...d,
      count: (perBand.get(d.code)?.size) || 0
    }));
  }

  function applyAllForVehicles(){
    const base = readBaseFiltersFromDOM();

    // 1) collisions filtered by Dashboard-2 sidebar
    const colFiltered = applyBaseCollisionFilters(base);
    const baseColSet = new Set(colFiltered.map(d => String(d.collision_index)));

    // 2) vehicles filtered by base collisions + vehicles tab filters
    const vehiclesFiltered = veh.vehicles.filter(v => {
      const id = String(v.collision_index);
      if (!baseColSet.has(id)) return false;

      const g = vehicleGroup(v.vehicle_type);
      const e = engineBand(v.engine_capacity_cc);
      const a = vehicleAgeBand(v.age_of_vehicle);

      if (!veh.filters.groups.has(g)) return false;
      if (!veh.filters.engines.has(e)) return false;
      if (!veh.filters.ages.has(a)) return false;

      return true;
    });

    const vehColSet = new Set(vehiclesFiltered.map(v => String(v.collision_index)));

    // 3) collisions for weather chart (subset to vehicles collisions)
    const collisionsForVehicles = colFiltered.filter(c => vehColSet.has(String(c.collision_index)));

    // 4) casualties for distance chart (subset + casualty filters)
    const casualtiesFiltered = veh.casualties.filter(c => {
      const id = String(c.collision_index);
      if (!vehColSet.has(id)) return false;

      const sev = sevLabel(c.casualty_severity);
      if (!base.sevSet.has(sev)) return false;

      const sx = sexLabel(c.sex_of_casualty);
      const ab = ageBandDerived(c.age_of_casualty);
      const cl = classLabel(c.casualty_class);

      if (base.sex !== "All" && sx !== base.sex) return false;
      if (base.ageBand !== "All" && ab !== base.ageBand) return false;
      if (base.casClass !== "All" && cl !== base.casClass) return false;

      return true;
    });

    return { vehiclesFiltered, collisionsForVehicles, casualtiesFiltered };
  }

  function renderVehicles(){
    if (!veh.loaded) return;

    const view = document.getElementById("view-vehicles");
    // If hidden, bounding boxes are 0; skip until visible
    if (view && !view.classList.contains("active")) return;

    const { vehiclesFiltered, collisionsForVehicles, casualtiesFiltered } = applyAllForVehicles();

    updateVehicleKpis(vehiclesFiltered);
    charts.impact.update(buildImpactData(vehiclesFiltered));
    charts.weather.update(buildWeatherData(collisionsForVehicles));
    charts.driverAge.update(buildDriverAgeData(vehiclesFiltered));
    charts.distance.update(buildDistanceData(casualtiesFiltered));
  }

  function bindUI(){
    // Vehicle filter dropdowns
    const selGroup = document.getElementById("vehSelGroup");
    const selEngine = document.getElementById("vehSelEngine");
    const selAge = document.getElementById("vehSelAge");
    const btnReset = document.getElementById("vehReset");

    if (!selGroup || !selEngine || !selAge || !btnReset) return;

    populateMultiSelect(selGroup, VEH_GROUPS);
    populateMultiSelect(selEngine, ["≤100 cc","101–500 cc","501–1000 cc",">1000 cc","Unknown"]);
    populateMultiSelect(selAge, ["0–3","4–10","11–20","21+","Unknown"]);

    function syncFromSelects(){
      veh.filters.groups = readSelected(selGroup);
      veh.filters.engines = readSelected(selEngine);
      veh.filters.ages = readSelected(selAge);

      // If user deselects everything, treat as “all”
      if (veh.filters.groups.size === 0){ selectAll(selGroup); veh.filters.groups = readSelected(selGroup); }
      if (veh.filters.engines.size === 0){ selectAll(selEngine); veh.filters.engines = readSelected(selEngine); }
      if (veh.filters.ages.size === 0){ selectAll(selAge); veh.filters.ages = readSelected(selAge); }

      renderVehicles();
    }

    selGroup.addEventListener("change", syncFromSelects);
    selEngine.addEventListener("change", syncFromSelects);
    selAge.addEventListener("change", syncFromSelects);

    btnReset.addEventListener("click", () => {
      selectAll(selGroup);
      selectAll(selEngine);
      selectAll(selAge);
      syncFromSelects();
    });

    // Make “Clear filters” reset vehicles filters too
    const btnClear = document.getElementById("btnClear");
    if (btnClear){
      btnClear.addEventListener("click", () => {
        selectAll(selGroup);
        selectAll(selEngine);
        selectAll(selAge);
        syncFromSelects();
      });
    }

    // Re-render when sidebar filters change (date + dropdowns + severity chips)
    const ids = ["dateStart","dateEnd","selPolice","selHighway","selRoadType","selSpeed","selSex","selAgeBand","selClass"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", renderVehicles);
    });

    // severity chips are buttons
    document.querySelectorAll("#severityButtons button").forEach(b => b.addEventListener("click", () => setTimeout(renderVehicles, 0)));

    // Tab switches + resize
    document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setTimeout(renderVehicles, 0)));
    window.addEventListener("resize", () => renderVehicles());
  }

  async function init(){
    // Load data
    const [collisionsRaw, casualtiesRaw, vehiclesRaw] = await Promise.all([
      d3.csv("data/collisions_2024.csv", d3.autoType),
      d3.csv("data/casualties_2024.csv", d3.autoType),
      d3.csv("data/vehicles_2024.csv", d3.autoType)
    ]);

    veh.collisions = collisionsRaw.map(d => ({
      ...d,
      _date: d.date ? parseDate(d.date) : null
    }));
    veh.casualties = casualtiesRaw;
    veh.vehicles = vehiclesRaw;

    // Create charts
    charts.impact = createImpactTreemap("#chartVehImpact");
    charts.weather = createWeatherBars("#chartVehWeather");
    charts.driverAge = createDriverAgePie("#chartVehDriverAge");
    charts.distance = createDistanceLine("#chartVehDistance");

    veh.loaded = true;

    bindUI();
    renderVehicles();
  }

  init().catch(err => {
    console.error(err);
    alert("Vehicles tab failed to load. Check that data/vehicles_2024.csv exists and you are running via a local web server.");
  });
})();
