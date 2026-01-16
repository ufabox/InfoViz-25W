let gbTopo = null;
let regionsGeoJSON = null;
let gbBorders = null;

// Vehicle grouping system
const vehicleGroups = {
    '1': 'Active / Personal',
    '16': 'Active / Personal',
    '22': 'Active / Personal',

    '2': 'Motorcycles',
    '3': 'Motorcycles',
    '4': 'Motorcycles',
    '5': 'Motorcycles',
    '23': 'Motorcycles',
    '97': 'Motorcycles',
    '103': 'Motorcycles',
    '104': 'Motorcycles',
    '105': 'Motorcycles',
    '106': 'Motorcycles',

    '8': 'Cars & Taxis',
    '9': 'Cars & Taxis',
    '108': 'Cars & Taxis',
    '109': 'Cars & Taxis',

    '10': 'Buses & Minibuses',
    '11': 'Buses & Minibuses',
    '110': 'Buses & Minibuses',

    '19': 'Vans & Goods',
    '20': 'Vans & Goods',
    '21': 'Vans & Goods',
    '113': 'Vans & Goods',
    '98': 'Vans & Goods',

    '17': 'Special Vehicles',
    '18': 'Special Vehicles',

    '90': 'Other / Unknown',
    '99': 'Other / Unknown'
};

/* ============================
   Labels
============================ */
const severityLabels = new Map([
  [1, "Fatal"],
  [2, "Serious"],
  [3, "Slight"],
  [-1, "Unknown"]
]);

const genderLabels = new Map([
  [1, "Male"],
  [2, "Female"],
  [-1, "Unknown"]
]);

const casualtyClassLabels = new Map([
  [1, "Driver"],
  [2, "Passenger"],
  [3, "Pedestrian"],
  [-1, "Unknown"]
]);

/* ============================
   Colors
============================ */
const COLORS = {
  neutralText: "#111827",
  neutralGray: "#6B7280",
  gridStroke: "#e5e7eb",
  unknown: "#9CA3AF",

  severity: {
    1: "#ff0000ff", // Fatal
    2: "#E69F00",   // Serious
    3: "#0072B2",   // Slight
    "-1": "#9CA3AF" // Unknown
  },

  gender: {
    1: "#0072B2",   // Male
    2: "#CC79A7",   // Female
    "-1": "#9CA3AF" // Unknown
  }
};

let dataAll = [];
let yearsAvailable = [];
let selectedYearCurrent = null;
let selectedYearPrior = null;

let activeSeverity = new Set([1, 2, 3]);
let activeSpeed = "ALL";

const ageBands = [
  { id: "ageUnk",   label: "Unknown", test: (a)=> a<0 || isNaN(a) },
  { id: "age0_15",  label: "0–15",    test: (a)=> a>=0 && a<=15 },
  { id: "age16_24", label: "16–24",   test: (a)=> a>=16 && a<=24 },
  { id: "age25_59", label: "25–59",   test: (a)=> a>=25 && a<=59 },
  { id: "age60p",   label: "60+",     test: (a)=> a>=60 }
];

let activeAgeBands = new Set(ageBands.map(d=>d.id));
let activeCasualtyClasses = new Set([1,2,3,-1]);
let activeGenders = new Set([1,2,-1]);

/* ============================
   MAP state
============================ */
let mapMode = "GRID";
let mapFocusFatal = false;
let mapZoomK = 1;

let brush = {
  kind: null,
  values: new Set()
};

function clearBrush(){
  brush.kind = null;
  brush.values = new Set();
}

function hasBrush(){
  return brush.kind !== null && brush.values.size > 0;
}

function toggleBrush(kind, value, multi){
  const v = String(value);

  if (brush.kind !== kind){
    brush.kind = kind;
    brush.values = new Set([v]);
    return;
  }

  if (!multi){
    if (brush.values.size === 1 && brush.values.has(v)){
      clearBrush();
      return;
    }
    brush.values = new Set([v]);
    return;
  }

  if (brush.values.has(v)) brush.values.delete(v);
  else brush.values.add(v);

  if (brush.values.size === 0) clearBrush();
}

function isDatumBrushed(d){
  if (!hasBrush()) return true;

  if (brush.kind === "SEVERITY"){
    return brush.values.has(String(+d.collision_severity));
  }
  if (brush.kind === "VEHICLE"){
    return brush.values.has(String(getVehicleGroup(d.vehicle_type)));
  }
  return true;
}

/* ============================
   Tooltip helpers
============================ */
// Tooltip container (keep separate from the Vehicles dashboard tooltips)
const tooltip = d3.select("#tooltip-collisions");

function showTooltip(html, event){
  tooltip.style("visibility","visible")
    .html(html)
    .style("left", (event.pageX + 12) + "px")
    .style("top",  (event.pageY - 12) + "px");
}
function hideTooltip(){
  tooltip.style("visibility","hidden");
}
function fmtInt(x){
  return d3.format(",")(Math.round(x));
}
function fmtPct(x){
  return (x >= 0 ? "+" : "") + x.toFixed(1) + "%";
}

/* ============================
   Data helpers
============================ */
function parseDateFlexible(s){
  if (s == null) return null;
  const str = String(s).trim();
  if (str.length === 0) return null;

  const iso = new Date(str);
  if (!isNaN(iso)) return iso;

  const parts = str.split("/");
  if (parts.length === 3){
    const dd = +parts[0], mm = +parts[1], yy = +parts[2];
    const dt = new Date(yy, mm-1, dd);
    if (!isNaN(dt)) return dt;
  }
  return null;
}

function getAgeBandId(age){
  const a = +age;
  for (const b of ageBands){
    if (b.test(a)) return b.id;
  }
  return "ageUnk";
}

function getVehicleGroup(vehicle_type){
  const key = String(vehicle_type);
  const g = vehicleGroups[key];
  if (!g) return "Other / Unknown";
  if (g === "Special Vehicles" || g === "Active / Personal" || g === "Other / Unknown") {
    return "Active / Special / Other";
  }
  return g;
}

function normalizeGender(v){
  const x = +v;
  return (x === 1 || x === 2) ? x : -1;
}

/* ============================
   Filtered view (by year)
============================ */
function filteredData(year){
  return dataAll.filter(d => {
    if (+d.collision_year !== +year) return false;

    if (activeSeverity.size === 0) return false;
    if (!activeSeverity.has(+d.collision_severity)) return false;

    if (activeSpeed !== "ALL" && +d.speed_limit !== +activeSpeed) return false;

    const band = getAgeBandId(d.age_of_casualty);
    if (!activeAgeBands.has(band)) return false;

    if (!activeCasualtyClasses.has(+d.casualty_class)) return false;

    if (!activeGenders.has(+d.sex_of_casualty)) return false;

    return true;
  });
}

function updateFiltersLabel(){
  const yCur = selectedYearCurrent;
  const yPrior = selectedYearPrior;

  const sevTxt = activeSeverity.size === 0
    ? "none"
    : Array.from(activeSeverity).map(s=>severityLabels.get(s) || String(s)).join(", ");

  const speedTxt = activeSpeed === "ALL" ? "ALL" : String(activeSpeed);
  const agesTxt = activeAgeBands.size === ageBands.length ? "ALL" : `${activeAgeBands.size} bands`;
  const clsTxt  = activeCasualtyClasses.size >= 4 ? "ALL" : `${activeCasualtyClasses.size} classes`;
  const genTxt  = activeGenders.size >= 3 ? "ALL" : `${activeGenders.size} genders`;

  const brushTxt = !hasBrush()
    ? "Brush: none"
    : (brush.kind === "SEVERITY"
      ? `Brush: Severity = ${Array.from(brush.values).map(v=>severityLabels.get(+v) || v).join(", ")}`
      : `Brush: Vehicle = ${Array.from(brush.values).join(", ")}`);

  d3.select("#activeFiltersLabel").text(
    `Current: ${yCur} | Prior: ${yPrior} | Severity: ${sevTxt} | Speed: ${speedTxt} | Age: ${agesTxt} | Class: ${clsTxt} | Gender: ${genTxt} | ${brushTxt}`
  );
}

/* ============================
   INSIGHTS
============================ */
function computeInsights(){
  const cur = filteredData(selectedYearCurrent);
  const prior = filteredData(selectedYearPrior);

  const curN = cur.length;
  const priorN = prior.length;

  let yoyTotal = null;
  if (priorN === 0 && curN === 0) yoyTotal = 0;
  else if (priorN === 0 && curN > 0) yoyTotal = null;
  else yoyTotal = ((curN - priorN) / priorN) * 100;

  const sevOrder = [1,2,3];
  const curBySev = new Map(sevOrder.map(s => [s, cur.filter(d=>+d.collision_severity===s).length]));
  const priorBySev = new Map(sevOrder.map(s => [s, prior.filter(d=>+d.collision_severity===s).length]));

  const yoyBySev = sevOrder.map(s => {
    const a = curBySev.get(s) || 0;
    const b = priorBySev.get(s) || 0;
    if (b === 0 && a === 0) return {s, pct: 0, cur:a, prior:b};
    if (b === 0 && a > 0) return {s, pct: null, cur:a, prior:b};
    return {s, pct: ((a-b)/b)*100, cur:a, prior:b};
  });

  const fatalCur = cur.filter(d=>+d.collision_severity===1);
  const fatalMale = fatalCur.filter(d=>+d.sex_of_casualty===1).length;
  const fatalFemale = fatalCur.filter(d=>+d.sex_of_casualty===2).length;
  const fatalKnown = fatalMale + fatalFemale;
  const fatalMaleShare = fatalKnown > 0 ? (fatalMale / fatalKnown) * 100 : null;

  const byVeh = d3.rollups(
    cur,
    v => ({
      n: v.length,
      fatal: v.filter(d=>+d.collision_severity===1).length
    }),
    d => getVehicleGroup(d.vehicle_type)
  )
  .map(([k,v]) => ({k, n:v.n, fatal:v.fatal}))
  .sort((a,b)=>b.n-a.n);

  const topVeh = byVeh.length ? byVeh[0] : null;
  const topVehFatalShare = topVeh && topVeh.n > 0 ? (topVeh.fatal / topVeh.n) * 100 : null;

  const computable = yoyBySev.filter(d => d.pct !== null);
  let biggestMover = null;
  if (computable.length){
    biggestMover = computable.slice().sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct))[0];
  }

  return {
    curN, priorN, yoyTotal,
    yoyBySev,
    fatalMaleShare,
    topVeh,
    topVehFatalShare,
    biggestMover
  };
}

function renderInsights(){
  const panel = d3.select("#insightsPanel");
  if (panel.empty()) return;

  const I = computeInsights();

  const yoyTxt = (I.yoyTotal === null) ? "n/a (no prior data)" : fmtPct(I.yoyTotal);
  const yoyCls = (I.yoyTotal === null) ? "m" : (I.yoyTotal > 0 ? "r" : (I.yoyTotal < 0 ? "g" : "k"));

  const sevLines = I.yoyBySev.map(d => {
    const name = severityLabels.get(d.s) || String(d.s);
    const val = (d.pct === null) ? "n/a" : fmtPct(d.pct);
    const cls = (d.pct === null) ? "m" : (d.pct > 0 ? "r" : (d.pct < 0 ? "g" : "k"));
    return `<div class="m">• <span class="k">${name}</span>: <span class="${cls}">${val}</span> <span class="m">(${fmtInt(d.cur)} vs ${fmtInt(d.prior)})</span></div>`;
  }).join("");

  const maleFatalTxt = (I.fatalMaleShare === null) ? "n/a" : `${I.fatalMaleShare.toFixed(0)}%`;
  const vehTxt = I.topVeh ? I.topVeh.k : "n/a";
  const vehFatalShareTxt = (I.topVeh && I.topVehFatalShare != null) ? `${I.topVehFatalShare.toFixed(1)}%` : "n/a";

  const moverTxt = I.biggestMover
    ? `${severityLabels.get(I.biggestMover.s)} (${fmtPct(I.biggestMover.pct)})`
    : "n/a";

  panel.html(`
    <div><b>Key insights</b> <span class="m">(updates with filters)</span></div>
    <div class="m" style="margin-top:6px">
      • <span class="k">Total casualties</span> YoY: <span class="${yoyCls}">${yoyTxt}</span>
    </div>
    <div class="m" style="margin-top:6px"><span class="k">YoY by severity</span></div>
    ${sevLines}
    <div class="m" style="margin-top:6px">
      • <span class="k">Fatal (Male share)</span>: <span class="k">${maleFatalTxt}</span> <span class="m">(among known gender)</span>
    </div>
    <div class="m" style="margin-top:6px">
      • <span class="k">Top vehicle group</span>: <span class="k">${vehTxt}</span>,
      <span class="k">Fatal share</span>: <span class="k">${vehFatalShareTxt}</span>
    </div>
    <div class="m" style="margin-top:6px">
      • <span class="k">Biggest mover</span>: <span class="k">${moverTxt}</span>
    </div>
  `);
}

/* ============================
   Charts
============================ */
function drawSeverityBar(data){
  const el = d3.select("#chartSeverity");
  el.selectAll("*").remove();

  const w = el.node().getBoundingClientRect().width || 500;
  const h = el.node().getBoundingClientRect().height || 260;

  const margin = {top: 12, right: 18, bottom: 34, left: 80};
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const svg = el.append("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  svg.on("click", () => {
    clearBrush();
    render();
  });

  const sevOrder = [1,2,3];
  const counts = sevOrder.map(s => ({
    sev: s,
    label: severityLabels.get(s),
    count: data.filter(d => +d.collision_severity === s).length
  }));

  const x = d3.scaleLinear()
    .domain([0, d3.max(counts, d=>d.count) || 1]).nice()
    .range([0, innerW]);

  const y = d3.scaleBand()
    .domain(counts.map(d=>d.label))
    .range([0, innerH])
    .padding(0.28);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(",d")))
    .selectAll("text").style("font-size","11px");

  g.append("g")
    .call(d3.axisLeft(y))
    .selectAll("text").style("font-size","12px").style("font-weight","800");

  const minBarPx = 6;

  const bars = g.selectAll("rect.bar")
    .data(counts)
    .enter()
    .append("rect")
    .attr("class","bar")
    .attr("x",0)
    .attr("y", d => y(d.label))
    .attr("height", y.bandwidth())
    .attr("width", d => (d.count > 0 ? Math.max(minBarPx, x(d.count)) : 0))
    .attr("rx", 6)
    .attr("fill", d => COLORS.severity[d.sev] || COLORS.unknown)
    .style("cursor","pointer")
    .style("opacity", d => {
      if (!hasBrush()) return 1;
      if (brush.kind !== "SEVERITY") return 0.55;
      return brush.values.has(String(d.sev)) ? 1 : 0.18;
    })
    .attr("stroke", d => {
      if (!hasBrush()) return "none";
      if (brush.kind !== "SEVERITY") return "none";
      return brush.values.has(String(d.sev)) ? "#111827" : "none";
    })
    .attr("stroke-width", d => {
      if (!hasBrush()) return 0;
      if (brush.kind !== "SEVERITY") return 0;
      return brush.values.has(String(d.sev)) ? 1.2 : 0;
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      toggleBrush("SEVERITY", d.sev, event.shiftKey);
      render();
    })
    .on("mousemove", (event, d) => showTooltip(
      `<b>${d.label}</b><br/>
       Casualty records: ${fmtInt(d.count)}<br/>
       <span style="color:${COLORS.neutralGray}">Click to brush (Shift+click multi)</span>`,
      event
    ))
    .on("mouseout", hideTooltip);

  const pad = 8;
  const rightPadding = 6;
  const insideMinSpace = 34;

  const labels = g.selectAll("text.val")
    .data(counts)
    .enter()
    .append("text")
    .attr("class","val")
    .attr("y", d => y(d.label) + y.bandwidth()/2)
    .attr("dy","0.35em")
    .style("font-size","12px")
    .style("font-weight","900")
    .text(d => fmtInt(d.count));

  labels
    .attr("x", d => (d.count > 0 ? Math.max(minBarPx, x(d.count)) : 0) + pad)
    .attr("text-anchor","start")
    .style("fill", d => {
      if (!hasBrush()) return COLORS.neutralText;
      if (brush.kind !== "SEVERITY") return COLORS.neutralText;
      return brush.values.has(String(d.sev)) ? COLORS.neutralText : COLORS.neutralGray;
    })
    .style("opacity", d => {
      if (!hasBrush()) return 1;
      if (brush.kind !== "SEVERITY") return 0.75;
      return brush.values.has(String(d.sev)) ? 1 : 0.35;
    });

  labels.each(function(d){
    const t = d3.select(this);
    const textW = this.getComputedTextLength();

    const barEnd = (d.count > 0 ? Math.max(minBarPx, x(d.count)) : 0);
    const outsideX = barEnd + pad;
    const maxX = innerW - rightPadding;
    const outsideWouldEnd = outsideX + textW;

    if (outsideWouldEnd > maxX){
      const insideX = Math.max(0, barEnd - pad);
      if (barEnd >= textW + insideMinSpace){
        t.attr("x", insideX)
          .attr("text-anchor","end")
          .style("fill","#ffffff");
      } else {
        const clampedX = Math.max(0, maxX - textW);
        t.attr("x", clampedX)
          .attr("text-anchor","start");
      }
    }
  });
}

function drawKPI(){
  const curData = filteredData(selectedYearCurrent);
  const priorData = filteredData(selectedYearPrior);

  const total = curData.length;
  const priorTotal = priorData.length;

  let deltaTxt = "—";
  if (priorTotal === 0 && total === 0) deltaTxt = "0.0%";
  else if (priorTotal === 0 && total > 0) deltaTxt = "+∞";
  else {
    const pct = ((total - priorTotal) / priorTotal) * 100;
    deltaTxt = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  }

  d3.select("#kpiTotal").text(fmtInt(total));
  d3.select("#kpiDelta").text(deltaTxt);
  d3.select("#kpiContext").text(`Current: ${selectedYearCurrent} vs Prior: ${selectedYearPrior} (lower is better)`);

  const deltaEl = d3.select("#kpiDelta");
  if (deltaTxt === "+∞") deltaEl.style("color", COLORS.neutralText);
  else if (deltaTxt.startsWith("+")) deltaEl.style("color", "#b91c1c");
  else if (deltaTxt.startsWith("-")) deltaEl.style("color", "#059669");
  else deltaEl.style("color", COLORS.neutralText);
}

function drawGenderPie(data){
  const el = d3.select("#chartGender");
  el.selectAll("*").remove();

  const w = el.node().getBoundingClientRect().width || 380;
  const h = el.node().getBoundingClientRect().height || 220;
  const r = Math.min(w, h) / 2 - 10;

  const svg = el.append("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${w/2},${h/2})`);

  const countsMap = d3.rollup(
    data,
    v => v.length,
    d => +d.sex_of_casualty
  );

  const pieData = Array.from(countsMap, ([k,v]) => ({
    key: +k,
    label: genderLabels.get(+k) || String(k),
    value: v
  }))
  .filter(d => activeGenders.has(d.key))
  .sort((a,b)=>b.value-a.value);

  const total = d3.sum(pieData, d=>d.value) || 1;

  const color = (k) => COLORS.gender[k] || COLORS.unknown;

  const pie = d3.pie().value(d=>d.value).sort(null);
  const arc = d3.arc().innerRadius(0).outerRadius(r);
  const arcHover = d3.arc().innerRadius(0).outerRadius(r+8);

  g.selectAll("path")
    .data(pie(pieData))
    .enter()
    .append("path")
    .attr("d", arc)
    .attr("fill", d => color(d.data.key))
    .attr("stroke","#fff")
    .attr("stroke-width",2)
    .style("opacity",0.92)
    .on("mousemove", (event, d) => {
      const pct = (d.data.value/total*100).toFixed(1);
      showTooltip(
        `<b>${d.data.label}</b><br/>Casualty records: ${fmtInt(d.data.value)}<br/>Share: ${pct}%`,
        event
      );
      d3.select(event.currentTarget).attr("d", arcHover).style("opacity",1);
    })
    .on("mouseout", (event) => {
      hideTooltip();
      d3.select(event.currentTarget).attr("d", arc).style("opacity",0.92);
    });

  g.selectAll("text.pct")
    .data(pie(pieData))
    .enter()
    .append("text")
    .attr("class","pct")
    .attr("transform", d => `translate(${arc.centroid(d)})`)
    .attr("text-anchor","middle")
    .style("font-size","11px")
    .style("font-weight","900")
    .style("fill","#fff")
    .text(d => {
      const pct = d.data.value/total*100;
      return pct >= 6 ? pct.toFixed(0) + "%" : "";
    });
}

function drawMonthlyLine(data){
  const el = d3.select("#chartMonthly");
  el.selectAll("*").remove();

  const currentData = data;
  const priorData = filteredData(selectedYearPrior);

  const w = el.node().getBoundingClientRect().width || 500;
  const h = el.node().getBoundingClientRect().height || 260;
  const margin = {top: 12, right: 16, bottom: 34, left: 56};
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const svg = el.append("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  function buildMonthlySeries(rows){
    const monthToSet = d3.rollup(
      rows,
      v => new Set(v.map(d => d.collision_index)),
      d => +d.month
    );

    return d3.range(1,13).map(m => ({
      month: m,
      monthName: d3.timeFormat("%b")(new Date(2000, m-1, 1)),
      collisions: monthToSet.has(m) ? monthToSet.get(m).size : 0
    }));
  }

  const seriesCur = buildMonthlySeries(currentData);
  const seriesPrior = buildMonthlySeries(priorData);

  const x = d3.scaleLinear().domain([1,12]).range([0, innerW]);
  const yMax = Math.max(
    d3.max(seriesCur, d=>d.collisions) || 0,
    d3.max(seriesPrior, d=>d.collisions) || 0,
    1
  );
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

  const xAxis = d3.axisBottom(x).ticks(12).tickFormat(m => d3.timeFormat("%b")(new Date(2000, m-1, 1)));
  const yAxis = d3.axisLeft(y).ticks(5).tickFormat(d3.format(",d"));

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(xAxis)
    .selectAll("text").style("font-size","11px");

  g.append("g")
    .call(yAxis)
    .selectAll("text").style("font-size","11px");

  g.append("text")
    .attr("x", -innerH/2)
    .attr("y", -42)
    .attr("transform", "rotate(-90)")
    .style("font-size","11px")
    .style("font-weight","700")
    .style("fill", COLORS.neutralGray)
    .style("text-anchor","middle")
    .text("Collisions (unique)");

  const line = d3.line()
    .x(d => x(d.month))
    .y(d => y(d.collisions))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(seriesPrior)
    .attr("fill","none")
    .attr("stroke", COLORS.neutralGray)
    .attr("stroke-width",2.2)
    .attr("stroke-dasharray","5,4")
    .attr("d", line);

  g.append("path")
    .datum(seriesCur)
    .attr("fill","none")
    .attr("stroke", COLORS.neutralText)
    .attr("stroke-width",2.6)
    .attr("d", line);

  g.selectAll("circle.pt-prior")
    .data(seriesPrior)
    .enter()
    .append("circle")
    .attr("class","pt-prior")
    .attr("cx", d => x(d.month))
    .attr("cy", d => y(d.collisions))
    .attr("r", 3.5)
    .attr("fill", COLORS.neutralGray)
    .attr("opacity",0.85)
    .on("mousemove", (event, d) =>
      showTooltip(
        `<b>PRIOR (${selectedYearPrior})</b><br/>${d.monthName}: ${fmtInt(d.collisions)} collisions (unique)`,
        event
      )
    )
    .on("mouseout", hideTooltip);

  g.selectAll("circle.pt-cur")
    .data(seriesCur)
    .enter()
    .append("circle")
    .attr("class","pt-cur")
    .attr("cx", d => x(d.month))
    .attr("cy", d => y(d.collisions))
    .attr("r", 4)
    .attr("fill", COLORS.neutralText)
    .on("mousemove", (event, d) =>
      showTooltip(
        `<b>CURRENT (${selectedYearCurrent})</b><br/>${d.monthName}: ${fmtInt(d.collisions)} collisions (unique)`,
        event
      )
    )
    .on("mouseout", hideTooltip);

  const legend = g.append("g")
    .attr("transform", `translate(10, ${innerH - 54})`);

  legend.append("rect")
    .attr("x",0).attr("y",0)
    .attr("width",90).attr("height",44)
    .attr("rx",10)
    .attr("fill","rgba(255,255,255,0.92)")
    .attr("stroke", COLORS.gridStroke);

  legend.append("line")
    .attr("x1",10).attr("y1",16)
    .attr("x2",34).attr("y2",16)
    .attr("stroke", COLORS.neutralText)
    .attr("stroke-width",2.6);

  legend.append("text")
    .attr("x",42).attr("y",20)
    .style("font-size","11px")
    .style("font-weight","800")
    .style("fill", COLORS.neutralText)
    .text(`${selectedYearCurrent}`);

  legend.append("line")
    .attr("x1",10).attr("y1",32)
    .attr("x2",34).attr("y2",32)
    .attr("stroke", COLORS.neutralGray)
    .attr("stroke-width",2.2)
    .attr("stroke-dasharray","5,4");

  legend.append("text")
    .attr("x",42).attr("y",36)
    .style("font-size","11px")
    .style("font-weight","800")
    .style("fill", COLORS.neutralGray)
    .text(`${selectedYearPrior}`);
}

function drawVehicleBar(data){
  const el = d3.select("#chartVehicle");
  el.selectAll("*").remove();

  const w = el.node().getBoundingClientRect().width || 500;
  const h = el.node().getBoundingClientRect().height || 260;

  const margin = {top: 12, right: 24, bottom: 34, left: 150};
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;

  const svg = el.append("svg").attr("width", w).attr("height", h);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  svg.on("click", () => {
    clearBrush();
    render();
  });

  const grouped = d3.rollups(
    data,
    v => v.length,
    d => getVehicleGroup(d.vehicle_type)
  )
  .map(([k,v]) => ({group:k, count:v}))
  .sort((a,b)=>b.count-a.count);

  const x = d3.scaleLinear()
    .domain([0, d3.max(grouped, d=>d.count) || 1]).nice()
    .range([0, innerW]);

  const y = d3.scaleBand()
    .domain(grouped.map(d=>d.group))
    .range([0, innerH])
    .padding(0.28);

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(",d")))
    .selectAll("text").style("font-size","11px");

  g.append("g")
    .call(d3.axisLeft(y))
    .selectAll("text").style("font-size","12px").style("font-weight","800");

  g.selectAll("rect.vehicle-bar")
    .data(grouped, d => d.group)
    .enter()
    .append("rect")
    .attr("class","vehicle-bar")
    .attr("x",0)
    .attr("y", d => y(d.group))
    .attr("height", y.bandwidth())
    .attr("width", d => x(d.count))
    .attr("rx", 6)
    .attr("fill", COLORS.neutralGray)
    .style("cursor","pointer")
    .style("opacity", d => {
      if (!hasBrush()) return 0.9;
      if (brush.kind !== "VEHICLE") return 0.45;
      return brush.values.has(String(d.group)) ? 1 : 0.16;
    })
    .attr("stroke", d => {
      if (!hasBrush()) return "none";
      if (brush.kind !== "VEHICLE") return "none";
      return brush.values.has(String(d.group)) ? "#111827" : "none";
    })
    .attr("stroke-width", d => {
      if (!hasBrush()) return 0;
      if (brush.kind !== "VEHICLE") return 0;
      return brush.values.has(String(d.group)) ? 1.2 : 0;
    })
    .on("click", (event, d) => {
      event.stopPropagation();
      toggleBrush("VEHICLE", d.group, event.shiftKey);
      render();
    })
    .on("mousemove", (event, d) => {
      const fatal = data.filter(x => getVehicleGroup(x.vehicle_type) === d.group && +x.collision_severity === 1).length;
      const fatalShare = d.count > 0 ? (fatal/d.count*100) : 0;
      showTooltip(
        `<b>${d.group}</b><br/>
         Casualty records: ${fmtInt(d.count)}<br/>
         Fatal share: ${fatalShare.toFixed(1)}%<br/>
         <span style="color:${COLORS.neutralGray}">Click to brush (Shift+click multi)</span>`,
        event
      );
    })
    .on("mouseout", hideTooltip);

  g.selectAll("text.val")
    .data(grouped, d => d.group)
    .enter()
    .append("text")
    .attr("class","val")
    .attr("x", d => x(d.count) + 8)
    .attr("y", d => y(d.group) + y.bandwidth()/2)
    .attr("dy","0.35em")
    .style("font-size","12px")
    .style("font-weight","900")
    .style("fill", d => {
      if (!hasBrush()) return COLORS.neutralText;
      if (brush.kind !== "VEHICLE") return COLORS.neutralGray;
      return brush.values.has(String(d.group)) ? COLORS.neutralText : COLORS.neutralGray;
    })
    .style("opacity", d => {
      if (!hasBrush()) return 1;
      if (brush.kind !== "VEHICLE") return 0.65;
      return brush.values.has(String(d.group)) ? 1 : 0.35;
    })
    .text(d => fmtInt(d.count));
}

/* ============================
   MAP
============================ */
function drawMap(data){
  const el = d3.select("#chartMap");
  el.selectAll("*").remove();

  const ui = el.append("div").attr("class","d2-map-ui");
  const btnPoints = ui.append("button").text("Points");
  const btnGrid   = ui.append("button").text("Grid");
  const btnFatal  = ui.append("button").text("Fatal focus");

  function syncUI(){
    btnPoints.classed("active", mapMode === "POINTS");
    btnGrid.classed("active", mapMode === "GRID");
    btnFatal.classed("active", mapFocusFatal === true);
  }
  btnPoints.on("click", () => { mapMode = "POINTS"; syncUI(); drawMap(data); });
  btnGrid.on("click", () => { mapMode = "GRID"; syncUI(); drawMap(data); });
  btnFatal.on("click", () => { mapFocusFatal = !mapFocusFatal; syncUI(); drawMap(data); });
  syncUI();

  const w = el.node().getBoundingClientRect().width || 520;
  const h = el.node().getBoundingClientRect().height || 470;

  const margin = {top: 8, right: 8, bottom: 8, left: 8};
  const statusH = 24;

  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom - statusH;

  const svg = el.append("svg").attr("width", w).attr("height", h);
  const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  svg.on("click", () => {
    clearBrush();
    render();
  });

  root.append("rect")
    .attr("x",0).attr("y",0)
    .attr("width", innerW).attr("height", innerH)
    .attr("fill","#fafafa")
    .attr("stroke", COLORS.gridStroke)
    .attr("rx", 12);

  if (!regionsGeoJSON || !gbBorders){
    root.append("text")
      .attr("x", 12).attr("y", 22)
      .style("font-size","12px")
      .style("fill", COLORS.neutralGray)
      .text("GB map not loaded (check topojson-client + internet).");
    return;
  }

  const projection = d3.geoMercator().fitSize([innerW, innerH], regionsGeoJSON);
  const path = d3.geoPath().projection(projection);

  const mapG = root.append("g").attr("class","mapG");

  mapG.append("g")
    .selectAll("path")
    .data(regionsGeoJSON.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#b9cce5ff")
    .attr("stroke", "none");

  mapG.append("path")
    .datum(gbBorders)
    .attr("fill", "none")
    .attr("stroke", "white")
    .attr("stroke-width", 0.45)
    .attr("d", path);

  const ptsRaw = data
    .filter(d => isFinite(+d.longitude) && isFinite(+d.latitude))
    .filter(d => mapFocusFatal ? (+d.collision_severity === 1) : true);

  if (ptsRaw.length === 0){
    mapG.append("text")
      .attr("x", 12).attr("y", innerH - 12)
      .style("font-size","11px")
      .style("fill", COLORS.neutralGray)
      .text("No points under current filters.");
  }

  const sevColor = (s) => COLORS.severity[s] || COLORS.unknown;

  function baseOpacityForSeverity(s){
    if (s === 1) return 0.55;
    if (s === 2) return 0.35;
    if (s === 3) return 0.20;
    return 0.12;
  }

  function brushedOpacityForPoint(d){
    if (!hasBrush()) return baseOpacityForSeverity(+d.collision_severity);

    const ok = isDatumBrushed(d);

    if (ok) return Math.min(0.95, baseOpacityForSeverity(+d.collision_severity) + 0.35);
    return 0.06;
  }

  function brushedRadiusForPoint(d){
    if (!hasBrush()) return (+d.collision_severity === 1 ? 1.9 : 1.4);

    const ok = isDatumBrushed(d);
    if (ok) return (+d.collision_severity === 1 ? 3.0 : 2.4);
    return (+d.collision_severity === 1 ? 1.6 : 1.2);
  }

  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .on("zoom", (event) => {
      mapZoomK = event.transform.k;
      mapG.attr("transform", event.transform);
    });

  svg.call(zoom);

  if (ptsRaw.length > 0){
    if (mapMode === "POINTS"){
      const maxPoints = 28000;
      let plotPts = ptsRaw;
      if (plotPts.length > maxPoints){
        const step = Math.ceil(plotPts.length / maxPoints);
        plotPts = plotPts.filter((_, i) => i % step === 0);
      }

      const sevOrder = new Map([[3,0],[2,1],[1,2],[-1,-1]]);
      plotPts = plotPts.slice().sort((a,b) => (sevOrder.get(+a.collision_severity) ?? -1) - (sevOrder.get(+b.collision_severity) ?? -1));

      const pointsLayer = mapG.append("g").attr("class","d2-map-points");

      pointsLayer.selectAll("circle")
        .data(plotPts)
        .enter()
        .append("circle")
        .attr("cx", d => {
          const p = projection([+d.longitude, +d.latitude]);
          return p ? p[0] : -9999;
        })
        .attr("cy", d => {
          const p = projection([+d.longitude, +d.latitude]);
          return p ? p[1] : -9999;
        })
        .attr("r", d => brushedRadiusForPoint(d))
        .attr("fill", d => sevColor(+d.collision_severity))
        .attr("opacity", d => brushedOpacityForPoint(d))
        .style("cursor","pointer")
        .attr("stroke", "none")
        .on("click", (event, d) => {
          event.stopPropagation();

          const multi = event.shiftKey;

          if (event.altKey){
            toggleBrush("VEHICLE", getVehicleGroup(d.vehicle_type), multi);
          } else {
            toggleBrush("SEVERITY", +d.collision_severity, multi);
          }
          render();
        })
        .on("mousemove", (event, d) => {
          const sevLabel = severityLabels.get(+d.collision_severity) || String(d.collision_severity);
          const vg = getVehicleGroup(d.vehicle_type);

          showTooltip(
            `<b>Casualty record</b><br/>
             collision_index: ${d.collision_index}<br/>
             date: ${String(d.date).slice(0,10)}<br/>
             severity: ${sevLabel}<br/>
             vehicle: ${vg}<br/>
             speed_limit: ${d.speed_limit}<br/>
             lon/lat: ${(+d.longitude).toFixed(4)}, ${( +d.latitude).toFixed(4)}<br/>
             <span style="color:${COLORS.neutralGray}">Click = brush severity • Alt+click = brush vehicle</span>`,
            event
          );

          d3.select(event.currentTarget)
            .attr("opacity", 0.98)
            .attr("r", 3.3);
        })
        .on("mouseout", (event, d) => {
          hideTooltip();
          d3.select(event.currentTarget)
            .attr("opacity", brushedOpacityForPoint(d))
            .attr("r", brushedRadiusForPoint(d));
        });

    } else {
      const cell = 7;
      const bins = new Map();

      for (const d of ptsRaw){
        const p = projection([+d.longitude, +d.latitude]);
        if (!p) continue;
        const gx = Math.floor(p[0] / cell);
        const gy = Math.floor(p[1] / cell);
        const key = gx + "|" + gy;

        if (!bins.has(key)){
          bins.set(key, {
            gx, gy,
            x: gx * cell,
            y: gy * cell,
            n: 0,
            sev: new Map([[1,0],[2,0],[3,0],[-1,0]])
          });
        }
        const b = bins.get(key);
        b.n += 1;
        const s = +d.collision_severity;
        b.sev.set(s, (b.sev.get(s) || 0) + 1);
      }

      const arr = Array.from(bins.values());
      const maxN = d3.max(arr, d=>d.n) || 1;

      const aScale = d3.scaleSqrt().domain([1, maxN]).range([0.10, 0.95]);

      function dominantSeverity(bin){
        const f = bin.sev.get(1) || 0;
        const se = bin.sev.get(2) || 0;
        const sl = bin.sev.get(3) || 0;
        const u = bin.sev.get(-1) || 0;
        const m = Math.max(f,se,sl,u);
        if (m === 0) return -1;
        if (m === f) return 1;
        if (m === se) return 2;
        if (m === sl) return 3;
        return -1;
      }

      function brushedOpacityForCell(bin){
        const dom = dominantSeverity(bin);

        if (!hasBrush()) return aScale(bin.n);

        if (brush.kind === "SEVERITY"){
          const ok = brush.values.has(String(dom));
          return ok ? Math.min(1, aScale(bin.n) + 0.20) : 0.05;
        }

        if (brush.kind === "VEHICLE"){
          return 0.25;
        }

        return aScale(bin.n);
      }

      const gridLayer = mapG.append("g").attr("class","d2-map-grid");

      gridLayer.selectAll("rect")
        .data(arr)
        .enter()
        .append("rect")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("width", cell)
        .attr("height", cell)
        .attr("fill", d => sevColor(dominantSeverity(d)))
        .attr("opacity", d => brushedOpacityForCell(d))
        .style("cursor","pointer")
        .attr("stroke", d => {
          if (!hasBrush()) return "none";
          if (brush.kind !== "SEVERITY") return "none";
          const dom = dominantSeverity(d);
          return brush.values.has(String(dom)) ? "#111827" : "none";
        })
        .attr("stroke-width", d => {
          if (!hasBrush()) return 0;
          if (brush.kind !== "SEVERITY") return 0;
          const dom = dominantSeverity(d);
          return brush.values.has(String(dom)) ? 0.8 : 0;
        })
        .on("click", (event, d) => {
          event.stopPropagation();
          const dom = dominantSeverity(d);
          toggleBrush("SEVERITY", dom, event.shiftKey);
          render();
        })
        .on("mousemove", (event, d) => {
          const dom = dominantSeverity(d);
          const domLabel = severityLabels.get(dom) || String(dom);

          const f = d.sev.get(1) || 0;
          const se = d.sev.get(2) || 0;
          const sl = d.sev.get(3) || 0;
          const u = d.sev.get(-1) || 0;

          showTooltip(
            `<b>Grid cell</b><br/>
             Total: ${fmtInt(d.n)}<br/>
             Fatal: ${fmtInt(f)}<br/>
             Serious: ${fmtInt(se)}<br/>
             Slight: ${fmtInt(sl)}<br/>
             Unknown: ${fmtInt(u)}<br/>
             Dominant: <b>${domLabel}</b><br/>
             <span style="color:${COLORS.neutralGray}">Click = brush dominant severity</span>`,
            event
          );

          d3.select(event.currentTarget).attr("opacity", Math.min(1, brushedOpacityForCell(d) + 0.18));
        })
        .on("mouseout", (event, d) => {
          hideTooltip();
          d3.select(event.currentTarget).attr("opacity", brushedOpacityForCell(d));
        });
    }
  }

  // ============================
  // Status text
  // ============================
  function statusText(){
    const mode = (mapMode === "POINTS") ? "Points" : "Grid";
    const fatal = mapFocusFatal ? " with Fatal Focus" : "";
    const brushInfo = !hasBrush()
      ? "Brush: none"
      : (brush.kind === "SEVERITY"
        ? `Brush: Severity = ${Array.from(brush.values).map(v=>severityLabels.get(+v) || v).join(", ")}`
        : `Brush: Vehicle = ${Array.from(brush.values).join(", ")}`);
    return `Mode: ${mode}${fatal} - scroll to zoom, drag to pan | ${brushInfo} (click empty area to clear)`;
  }

// ============================
// Status text
// ============================
function statusLines(){
  const mode = (mapMode === "POINTS") ? "Points" : "Grid";
  const fatal = mapFocusFatal ? " with Fatal Focus" : "";

  const brushInfo = !hasBrush()
    ? "Brush: none"
    : (brush.kind === "SEVERITY"
      ? `Brush: Severity = ${Array.from(brush.values).map(v=>severityLabels.get(+v) || v).join(", ")}`
      : `Brush: Vehicle = ${Array.from(brush.values).join(", ")}`);

  const line1 = `Mode: ${mode}${fatal} - scroll to zoom, drag to pan`;
  const line2 = `${brushInfo} (click empty area to clear)`;

  return [line1, line2];
}

  const statusG = root.append("g").attr("class", "d2-map-status-layer");

  const yBase = innerH + statusH - 10;
  const lineGap = 13;

  const statusTextEl = statusG.append("text")
    .attr("class", "d2-map-status")
    .attr("x", 14)
    .attr("y", yBase)
    .style("font-size","11px")
    .style("font-weight","800")
    .style("fill", COLORS.neutralGray);

  const [l1, l2] = statusLines();

  statusTextEl.append("tspan")
    .attr("x", 14)
    .attr("dy", 0)
    .text(l1);

  statusTextEl.append("tspan")
    .attr("x", 14)
    .attr("dy", lineGap)
    .text(l2);

  // legend
  const legendItems = [
    { sev: 1, label: "Fatal" },
    { sev: 2, label: "Serious" },
    { sev: 3, label: "Slight" },
    { sev: -1, label: "Unknown" }
  ];

  const legend = root.append("g")
    .attr("class", "d2-map-legend")
    .attr("transform", `translate(${innerW - 150}, 14)`);

  legend.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", 136).attr("height", 92)
    .attr("rx", 10)
    .attr("fill", "rgba(255,255,255,0.92)")
    .attr("stroke", COLORS.gridStroke);

  legend.append("text")
    .attr("x", 10).attr("y", 18)
    .style("font-size", "11px")
    .style("font-weight", "800")
    .style("fill", COLORS.neutralText)
    .text("Severity");

  const row = legend.selectAll("g.row")
    .data(legendItems)
    .enter()
    .append("g")
    .attr("class", "row")
    .attr("transform", (d,i) => `translate(10, ${26 + i*16})`);

  row.append("circle")
    .attr("cx", 6)
    .attr("cy", 6)
    .attr("r", 4.5)
    .attr("fill", d => sevColor(d.sev))
    .attr("opacity", d => (d.sev === -1 ? 0.6 : 1));

  row.append("text")
    .attr("x", 18)
    .attr("y", 10)
    .style("font-size", "11px")
    .style("fill", COLORS.neutralText)
    .text(d => d.label);
}

/* ============================
   Render all
============================ */
function render(){
  updateFiltersLabel();

  const viewData = filteredData(selectedYearCurrent);

  drawSeverityBar(viewData);
  drawKPI();
  drawGenderPie(viewData);
  drawMonthlyLine(viewData);
  drawVehicleBar(viewData);
  drawMap(viewData);

  renderInsights();
}

/* ============================
   UI Helpers
============================ */
function addAllNoneControls(containerSelector, onAll, onNone){
  const box = d3.select(containerSelector);

  box.selectAll(".d2-mini-controls").remove();

  const row = box.insert("div", ":first-child")
    .attr("class", "d2-mini-controls")
    .style("display", "flex")
    .style("gap", "8px")
    .style("margin-bottom", "8px");

  row.append("button")
    .attr("type", "button")
    .attr("class", "d2-btn")
    .style("padding", "6px 10px")
    .style("font-size", "11px")
    .text("All")
    .on("click", () => { onAll(); render(); });

  row.append("button")
    .attr("type", "button")
    .attr("class", "d2-btn")
    .style("padding", "6px 10px")
    .style("font-size", "11px")
    .text("None")
    .on("click", () => { onNone(); render(); });
}

/* ============================
   Filter UI
============================ */
function buildAgeChecklist(){
  const box = d3.select("#ageChecklist");
  box.selectAll("*").remove();

  addAllNoneControls(
    "#ageChecklist",
    () => {
      activeAgeBands = new Set(ageBands.map(d=>d.id));
      ageBands.forEach(b => d3.select("#"+b.id).property("checked", true));
    },
    () => {
      activeAgeBands = new Set();
      ageBands.forEach(b => d3.select("#"+b.id).property("checked", false));
    }
  );

  const items = box.selectAll("label.d2-checkitem")
    .data(ageBands)
    .enter()
    .append("label")
    .attr("class","d2-checkitem");

  items.append("input")
    .attr("type","checkbox")
    .attr("checked", true)
    .attr("id", d => d.id)
    .on("change", function(event, d){
      if (this.checked) activeAgeBands.add(d.id);
      else activeAgeBands.delete(d.id);
      render();
    });

  items.append("span").text(d => d.label);
}

function buildClassChecklist(){
  const uniq = Array.from(new Set(dataAll.map(d => +d.casualty_class))).sort((a,b)=>a-b);

  const box = d3.select("#classChecklist");
  box.selectAll("*").remove();

  addAllNoneControls(
    "#classChecklist",
    () => {
      activeCasualtyClasses = new Set(uniq);
      uniq.forEach(v => d3.select("#cls_" + v).property("checked", true));
    },
    () => {
      activeCasualtyClasses = new Set();
      uniq.forEach(v => d3.select("#cls_" + v).property("checked", false));
    }
  );

  const items = box.selectAll("label.d2-checkitem")
    .data(uniq)
    .enter()
    .append("label")
    .attr("class","d2-checkitem");

  items.append("input")
    .attr("type","checkbox")
    .attr("checked", d => activeCasualtyClasses.has(d))
    .attr("id", d => "cls_" + d)
    .on("change", function(event, d){
      if (this.checked) activeCasualtyClasses.add(d);
      else activeCasualtyClasses.delete(d);
      render();
    });

  items.append("span").text(d => casualtyClassLabels.get(d) || `Class ${d}`);

  box.selectAll("input[type='checkbox']").property("checked", function(){
    const v = +this.id.replace("cls_","");
    return activeCasualtyClasses.has(v);
  });
}

function buildGenderChecklist(){
  const uniq = Array.from(new Set(dataAll.map(d => +d.sex_of_casualty))).sort((a,b)=>a-b);

  const box = d3.select("#genderChecklist");
  box.selectAll("*").remove();

  addAllNoneControls(
    "#genderChecklist",
    () => {
      activeGenders = new Set(uniq);
      uniq.forEach(v => d3.select("#gen_" + v).property("checked", true));
    },
    () => {
      activeGenders = new Set();
      uniq.forEach(v => d3.select("#gen_" + v).property("checked", false));
    }
  );

  const items = box.selectAll("label.d2-checkitem")
    .data(uniq)
    .enter()
    .append("label")
    .attr("class","d2-checkitem");

  items.append("input")
    .attr("type","checkbox")
    .attr("checked", d => activeGenders.has(d))
    .attr("id", d => "gen_" + d)
    .on("change", function(event, d){
      if (this.checked) activeGenders.add(d);
      else activeGenders.delete(d);
      render();
    });

  items.append("span").text(d => genderLabels.get(d) || `Gender ${d}`);
}

function buildSpeedSelect(){
  const speeds = Array.from(new Set(dataAll.map(d => +d.speed_limit)))
    .filter(d => !isNaN(d))
    .sort((a,b)=>a-b);

  const sel = d3.select("#speedSelect");
  sel.selectAll("option.speedOpt").remove();

  sel.selectAll("option.speedOpt")
    .data(speeds)
    .enter()
    .append("option")
    .attr("class","speedOpt")
    .attr("value", d => d)
    .text(d => d === -1 ? "Unknown" : d);

  sel.on("change", function(){
    activeSpeed = this.value === "ALL" ? "ALL" : +this.value;
    render();
  });
}

/* ============================
   YEAR selects
============================ */
function buildYearSelects(){
  const curSel = d3.select("#currentYearSelect");
  const priorSel = d3.select("#priorYearSelect");

  curSel.selectAll("option.yearOpt").remove();

  curSel.selectAll("option.yearOpt")
    .data(yearsAvailable)
    .enter()
    .append("option")
    .attr("class","yearOpt")
    .attr("value", d => d)
    .text(d => d);

  function rebuildPriorOptions(){
    const priorYears = yearsAvailable.filter(y => +y !== +selectedYearCurrent);

    priorSel.selectAll("option.yearOpt").remove();

    priorSel.selectAll("option.yearOpt")
      .data(priorYears)
      .enter()
      .append("option")
      .attr("class","yearOpt")
      .attr("value", d => d)
      .text(d => d);

    const allowed = new Set(priorYears.map(y => +y));
    if (!allowed.has(+selectedYearPrior)){
      const prefer = +selectedYearCurrent - 1;
      if (allowed.has(prefer)) selectedYearPrior = prefer;
      else selectedYearPrior = priorYears.length ? +priorYears[priorYears.length - 1] : null;
    }

    if (selectedYearPrior != null) priorSel.property("value", selectedYearPrior);
  }

  if (selectedYearCurrent != null) curSel.property("value", selectedYearCurrent);

  rebuildPriorOptions();

  curSel.on("change", function(){
    selectedYearCurrent = +this.value;
    rebuildPriorOptions();
    render();
  });

  priorSel.on("change", function(){
    selectedYearPrior = +this.value;
    render();
  });
}

/* ============================
   Severity buttons
============================ */
const severityBtnColor = new Map([
  [1, COLORS.severity[1]],
  [2, COLORS.severity[2]],
  [3, COLORS.severity[3]]
]);

function applySeverityButtonStyles(){
  function paint(btnId, sev){
    const isOn = activeSeverity.has(sev);
    const sel = d3.select(btnId);

    sel.classed("d2-btn-active", isOn);

    sel.style("background-color", isOn ? severityBtnColor.get(sev) : null)
      .style("border-color", isOn ? severityBtnColor.get(sev) : null)
      .style("color", isOn ? "#ffffff" : null);
  }

  const allOn = activeSeverity.size === 3;
  d3.select("#sevAll")
    .classed("d2-btn-active", allOn)
    .style("background-color", allOn ? COLORS.neutralText : null)
    .style("border-color", allOn ? COLORS.neutralText : null)
    .style("color", allOn ? "#ffffff" : null);

  paint("#sevFatal", 1);
  paint("#sevSerious", 2);
  paint("#sevSlight", 3);
}

function setSeverityButtons(){
  d3.select("#sevAll").on("click", () => {
    const allOn = activeSeverity.size === 3;
    if (allOn) activeSeverity = new Set();
    else activeSeverity = new Set([1,2,3]);
    applySeverityButtonStyles();
    render();
  });

  d3.select("#sevFatal").on("click", () => {
    const s = 1;
    if (activeSeverity.has(s)) activeSeverity.delete(s);
    else activeSeverity.add(s);
    applySeverityButtonStyles();
    render();
  });

  d3.select("#sevSerious").on("click", () => {
    const s = 2;
    if (activeSeverity.has(s)) activeSeverity.delete(s);
    else activeSeverity.add(s);
    applySeverityButtonStyles();
    render();
  });

  d3.select("#sevSlight").on("click", () => {
    const s = 3;
    if (activeSeverity.has(s)) activeSeverity.delete(s);
    else activeSeverity.add(s);
    applySeverityButtonStyles();
    render();
  });

  applySeverityButtonStyles();
}

/* ============================
   Reset
============================ */
function resetAll(){
  activeSeverity = new Set([1,2,3]);
  activeSpeed = "ALL";
  activeAgeBands = new Set(ageBands.map(d=>d.id));

  activeCasualtyClasses = new Set([1,2,3,-1]);
  activeGenders = new Set([1,2,-1]);

  mapMode = "GRID";
  mapFocusFatal = false;
  mapZoomK = 1;

  clearBrush();

  const maxY = yearsAvailable.length ? yearsAvailable[yearsAvailable.length - 1] : null;
  const secondMaxY = yearsAvailable.length >= 2 ? yearsAvailable[yearsAvailable.length - 2] : maxY;
  selectedYearCurrent = maxY;
  selectedYearPrior = secondMaxY;

  d3.select("#currentYearSelect").property("value", selectedYearCurrent);
  d3.select("#priorYearSelect").property("value", selectedYearPrior);
  d3.select("#speedSelect").property("value", "ALL");

  buildAgeChecklist();
  buildClassChecklist();
  buildGenderChecklist();

  applySeverityButtonStyles();
  render();
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;

      // tabs
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // content
      contents.forEach(c => c.classList.remove("active"));
      const target = document.getElementById(targetId);
      if (target) target.classList.add("active");
    });
  });
}

/* ============================
   Init
============================ */
async function init(){
  const gbUrl = "https://cdn.jsdelivr.net/gh/ONSvisual/topojson_boundaries@master/geogGBregion.json?short_path=6bd9372";

  const [raw, gb] = await Promise.all([
    // All CSVs are expected under ./data (next to index.html)
    d3.csv("data/df_merged_GB_collisions_last5.csv"),
    d3.json(gbUrl)
  ]);

  gbTopo = gb;
  regionsGeoJSON = topojson.feature(gbTopo, gbTopo.objects.GBregion);
  gbBorders = topojson.mesh(gbTopo, gbTopo.objects.GBregion, (a, b) => a !== b);

  dataAll = raw.map(d => ({
    collision_index: d.collision_index,
    collision_year: +d.collision_year,
    date: d.date,
    month: +d.month,
    month_name: d.month_name,
    speed_limit: +d.speed_limit,
    collision_severity: +d.collision_severity,
    longitude: +d.longitude,
    latitude: +d.latitude,
    vehicle_type: +d.vehicle_type,
    casualty_class: +d.casualty_class,
    age_of_casualty: +d.age_of_casualty,
    sex_of_casualty: normalizeGender(d.sex_of_casualty),
    _dateObj: parseDateFlexible(d.date)
  }));

  yearsAvailable = Array.from(new Set(dataAll.map(d => +d.collision_year)))
    .filter(y => !isNaN(y))
    .sort((a,b)=>a-b);

  const maxY = yearsAvailable.length ? yearsAvailable[yearsAvailable.length - 1] : null;
  const secondMaxY = yearsAvailable.length >= 2 ? yearsAvailable[yearsAvailable.length - 2] : maxY;

  selectedYearCurrent = maxY;
  selectedYearPrior = secondMaxY;

  activeGenders = new Set([1,2,-1]);

  buildAgeChecklist();
  buildSpeedSelect();
  buildClassChecklist();
  buildGenderChecklist();
  buildYearSelects();
  setSeverityButtons();

  d3.select("#btnReset").on("click", resetAll);

  // Esc to clear brushing
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      if (hasBrush()){
        clearBrush();
        render();
      }
    }
  });

  render();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      render();
    });
  });
}

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});

init().catch(err => {
  console.error(err);
  alert("Could not load the CSV and/or topojson. Make sure you run via a local server and that data/df_merged_GB_collisions_last5.csv exists.");
});

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
});