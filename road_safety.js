/* Road Safety Dashboard (D3.js)
   - Joins collisions + casualties on collision_index
   - Power BI–style layout with filter panel and switchers
*/

const fmtInt = d3.format(",");
const parseDate = d3.timeParse("%d/%m/%Y");

const tooltip = d3.select("#tooltip");

function showTip(html, event){
  tooltip
    .style("opacity", 1)
    .html(html)
    .style("left", (event.clientX + 12) + "px")
    .style("top", (event.clientY + 12) + "px");
}
function hideTip(){ tooltip.style("opacity", 0); }

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

// Minimal mapping; fallback keeps codes visible.
const casualtyTypeMap = new Map([
  [0, "Pedestrian"],
  [1, "Pedal cycle"],
  [2, "Motorcycle (≤50cc)"],
  [3, "Motorcycle (50–125cc)"],
  [4, "Motorcycle (125–500cc)"],
  [5, "Motorcycle (>500cc)"],
  [9, "Car occupant"],
  [11, "Bus/coach occupant"],
  [19, "Goods vehicle occupant"],
]);
function casualtyTypeLabel(code){
  const c = +code;
  return casualtyTypeMap.get(c) ?? `Type ${c}`;
}

const dayNames = new Map([
  [1, "Sun"], [2, "Mon"], [3, "Tue"], [4, "Wed"], [5, "Thu"], [6, "Fri"], [7, "Sat"]
]);

// Global state
const state = {
  data: {
    collisions: [],
    casualties: [],
    casualtiesEnriched: []
  },
  filters: {
    dateStart: null,
    dateEnd: null,
    police_force: "All",
    highway: "All",
    road_type: "All",
    speed_limit: "All",
    sex: "All",
    ageBand: "All",
    casualty_class: "All",
    severities: new Set(["Fatal","Serious","Slight"]),
    heatMetric: "count" // count | ksiShare
  }
};

// --- Charts (each returns {update})
function createSeverityBarChart(svgSel){
  const svg = d3.select(svgSel);
  const margin = {top: 10, right: 14, bottom: 28, left: 68};

  function render(data){
    const {width, height} = svg.node().getBoundingClientRect();
    svg.attr("viewBox", [0,0,width,height]);

    svg.selectAll("*").remove();

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const order = ["Fatal","Serious","Slight"];
    const series = order.map(k => ({key:k, value: data.get(k) ?? 0}));

    const x = d3.scaleLinear()
      .domain([0, d3.max(series, d => d.value) || 1]).nice()
      .range([0, innerW]);

    const y = d3.scaleBand()
      .domain(order)
      .range([0, innerH])
      .padding(0.22);

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(fmtInt))
      .call(g => g.select(".domain").remove());

    g.selectAll("rect.bar")
      .data(series, d => d.key)
      .join("rect")
      .attr("class", "bar")
      .attr("x", 0)
      .attr("y", d => y(d.key))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value))
      .attr("rx", 8)
      .on("mousemove", (event, d) => {
        showTip(`<div><strong>${d.key}</strong></div><div>Casualties: ${fmtInt(d.value)}</div>`, event);
      })
      .on("mouseleave", hideTip);

    g.selectAll("text.value")
      .data(series, d => d.key)
      .join("text")
      .attr("class", "value")
      .attr("x", d => x(d.value) + 6)
      .attr("y", d => y(d.key) + y.bandwidth()/2 + 4)
      .style("font-weight", 900)
      .style("fill", "#1a1d29")
      .text(d => fmtInt(d.value));
  }

  return { update: render };
}

function createClassStacked100(svgSel){
  const svg = d3.select(svgSel);
  const margin = {top: 10, right: 18, bottom: 28, left: 110};

  function render(rows){
    const {width, height} = svg.node().getBoundingClientRect();
    svg.attr("viewBox", [0,0,width,height]);
    svg.selectAll("*").remove();

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const keys = ["Fatal","Serious","Slight"];
    const classes = ["Driver/Rider","Passenger","Pedestrian","Unknown"].filter(c => rows.some(r => r.classLabel === c));

    // Normalize to 100%
    const norm = rows.map(r => {
      const total = keys.reduce((s,k)=> s + (r[k]||0), 0) || 1;
      const out = {classLabel: r.classLabel, total};
      keys.forEach(k => out[k] = (r[k]||0)/total);
      return out;
    });

    const y = d3.scaleBand().domain(classes).range([0, innerH]).padding(0.22);
    const x = d3.scaleLinear().domain([0,1]).range([0, innerW]);

    const stack = d3.stack().keys(keys);
    const stacked = stack(norm);

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")))
      .call(g => g.select(".domain").remove());

    const layer = g.selectAll("g.layer")
      .data(stacked, d => d.key)
      .join("g")
      .attr("class", "layer");

    layer.selectAll("rect")
      .data(d => d.map(v => ({key: d.key, v, classLabel: v.data.classLabel, total: v.data.total})))
      .join("rect")
      .attr("x", d => x(d.v[0]))
      .attr("y", d => y(d.classLabel))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.v[1]) - x(d.v[0]))
      .attr("rx", 7)
      .on("mousemove", (event, d) => {
        const pct = d3.format(".1%")(d.v[1]-d.v[0]);
        const count = Math.round((d.v[1]-d.v[0]) * d.total);
        showTip(`<div><strong>${d.classLabel}</strong></div><div>${d.key}: ${pct} (${fmtInt(count)})</div>`, event);
      })
      .on("mouseleave", hideTip);

    // Label the largest segment in each bar (optional readability)
    const byClass = new Map(norm.map(d => [d.classLabel, d]));
    g.selectAll("text.barlabel")
      .data(classes)
      .join("text")
      .attr("class", "barlabel")
      .attr("x", x(0.99))
      .attr("y", d => y(d) + y.bandwidth()/2 + 4)
      .attr("text-anchor", "end")
      .style("font-weight", 900)
      .style("fill", "#1a1d29")
      .text(d => fmtInt(byClass.get(d)?.total ?? 0));
  }

  return { update: render };
}

function createHeatmap(svgSel){
  const svg = d3.select(svgSel);
  const margin = {top: 16, right: 16, bottom: 42, left: 90};

  function render(cells, metric){
    const {width, height} = svg.node().getBoundingClientRect();
    svg.attr("viewBox", [0,0,width,height]);
    svg.selectAll("*").remove();

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xDomain = Array.from(new Set(cells.map(d => d.x))).sort((a,b) => d3.ascending(a,b));
    const yOrder = ["0–15","16–24","25–59","60+","Unknown"];
    const yDomain = yOrder.filter(y => cells.some(d => d.y === y));

    const x = d3.scaleBand().domain(xDomain).range([0, innerW]).padding(0.08);
    const y = d3.scaleBand().domain(yDomain).range([0, innerH]).padding(0.10);

    const values = cells.map(d => metric === "ksiShare" ? d.ksiShare : d.count);
    const maxV = d3.max(values) ?? 1;

    // No explicit colors requested; use default interpolator
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, maxV || 1]);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    const fmt = metric === "ksiShare" ? d3.format(".1%") : fmtInt;

    g.selectAll("rect.cell")
      .data(cells, d => d.x + "|" + d.y)
      .join("rect")
      .attr("class", "cell")
      .attr("x", d => x(d.x))
      .attr("y", d => y(d.y))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 10)
      .attr("fill", d => color(metric === "ksiShare" ? d.ksiShare : d.count))
      .attr("stroke", "rgba(0,0,0,.06)")
      .on("mousemove", (event, d) => {
        const v = metric === "ksiShare" ? d.ksiShare : d.count;
        const main = metric === "ksiShare" ? "KSI share" : "Count";
        showTip(
          `<div><strong>${d.y}</strong> × <strong>${d.x}</strong></div>
           <div>${main}: ${fmt(v)}</div>
           <div class="muted">Fatal+Serious: ${fmtInt(d.ksi)} • Total: ${fmtInt(d.total)}</div>`,
          event
        );
      })
      .on("mouseleave", hideTip);

    // Labels
    g.selectAll("text.cellLabel")
      .data(cells, d => d.x + "|" + d.y)
      .join("text")
      .attr("class", "cellLabel")
      .attr("x", d => x(d.x) + x.bandwidth()/2)
      .attr("y", d => y(d.y) + y.bandwidth()/2 + 4)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", 900)
      .style("fill", d => {
        const v = metric === "ksiShare" ? d.ksiShare : (d.count / (maxV || 1));
        return v > 0.55 ? "white" : "#0b1027";
      })
      .text(d => fmt(metric === "ksiShare" ? d.ksiShare : d.count));
  }

  return { update: render };
}

function createTopTypesBar(svgSel){
  const svg = d3.select(svgSel);
  const margin = {top: 10, right: 14, bottom: 28, left: 190};

  function render(items){
    const {width, height} = svg.node().getBoundingClientRect();
    svg.attr("viewBox", [0,0,width,height]);
    svg.selectAll("*").remove();

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

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
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(fmtInt))
      .call(g => g.select(".domain").remove());

    g.selectAll("rect")
      .data(items, d => d.key)
      .join("rect")
      .attr("x", 0)
      .attr("y", d => y(d.key))
      .attr("height", y.bandwidth())
      .attr("width", d => x(d.value))
      .attr("rx", 8)
      .on("mousemove", (event, d) => {
        showTip(`<div><strong>${d.key}</strong></div><div>Casualties: ${fmtInt(d.value)}</div>`, event);
      })
      .on("mouseleave", hideTip);

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

function createTimeHeatmap(svgSel){
  const svg = d3.select(svgSel);
  const margin = {top: 16, right: 16, bottom: 42, left: 70};

  function render(cells){
    const {width, height} = svg.node().getBoundingClientRect();
    svg.attr("viewBox", [0,0,width,height]);
    svg.selectAll("*").remove();

    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xDomain = d3.range(0,24).map(d => String(d).padStart(2,"0"));
    const yDomain = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; // readable order

    const x = d3.scaleBand().domain(xDomain).range([0, innerW]).padding(0.06);
    const y = d3.scaleBand().domain(yDomain).range([0, innerH]).padding(0.10);

    const values = cells.map(d => d.value);
    const maxV = d3.max(values) ?? 1;
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, maxV || 1]);

    g.append("g")
      .attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues(xDomain.filter(h => +h % 3 === 0)).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.append("g")
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.selectAll("text").style("font-weight", 800))
      .call(g => g.select(".domain").remove());

    g.selectAll("rect.cell")
      .data(cells, d => d.day + "|" + d.hour)
      .join("rect")
      .attr("class", "cell")
      .attr("x", d => x(d.hour))
      .attr("y", d => y(d.day))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 9)
      .attr("fill", d => color(d.value))
      .attr("stroke", "rgba(0,0,0,.06)")
      .on("mousemove", (event, d) => {
        showTip(`<div><strong>${d.day}</strong> @ <strong>${d.hour}:00</strong></div><div>Casualties: ${fmtInt(d.value)}</div>`, event);
      })
      .on("mouseleave", hideTip);

    // small labels for higher values only (avoid clutter)
    const threshold = (maxV || 1) * 0.65;
    g.selectAll("text.cellLabel")
      .data(cells.filter(d => d.value >= threshold), d => d.day + "|" + d.hour)
      .join("text")
      .attr("x", d => x(d.hour) + x.bandwidth()/2)
      .attr("y", d => y(d.day) + y.bandwidth()/2 + 4)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", 900)
      .style("fill", "white")
      .text(d => fmtInt(d.value));
  }

  return { update: render };
}

// Chart instances
const charts = {};

// --- UI wiring
function setActiveButton(container, btn){
  container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}
function toggleChip(btn){
  btn.classList.toggle("active");
}

function populateSelect(selectEl, values, {includeAll=true, allLabel="All"} = {}){
  selectEl.innerHTML = "";
  if (includeAll){
    const opt = document.createElement("option");
    opt.value = "All";
    opt.textContent = allLabel;
    selectEl.appendChild(opt);
  }
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

function initTabs(){
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
      document.getElementById(`view-${view}`).classList.add("active");

      // force resize re-render
      updateAll();
    });
  });
}

function initSwitchers(){
  const sevWrap = document.getElementById("severityButtons");
  sevWrap.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      const sev = btn.dataset.sev;
      toggleChip(btn);
      if (btn.classList.contains("active")) state.filters.severities.add(sev);
      else state.filters.severities.delete(sev);

      // if user deselects all, reselect all
      if (state.filters.severities.size === 0){
        ["Fatal","Serious","Slight"].forEach(s => state.filters.severities.add(s));
        sevWrap.querySelectorAll("button").forEach(b => b.classList.add("active"));
      }
      updateAll();
    });
  });

  const metWrap = document.getElementById("metricButtons");
  metWrap.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      metWrap.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.heatMetric = btn.dataset.metric;
      updateAll();
    });
  });
}

function initFiltersFromData(collisions, casualtiesEnriched){
  // Dates
  const dates = collisions.map(d => d._date).filter(Boolean).sort((a,b)=>a-b);
  const minD = dates[0], maxD = dates[dates.length-1];
  const toISO = d => d.toISOString().slice(0,10);

  const dateStart = document.getElementById("dateStart");
  const dateEnd = document.getElementById("dateEnd");
  dateStart.value = toISO(minD);
  dateEnd.value = toISO(maxD);
  state.filters.dateStart = minD;
  state.filters.dateEnd = maxD;

  dateStart.addEventListener("change", () => {
    state.filters.dateStart = dateStart.value ? new Date(dateStart.value) : null;
    updateAll();
  });
  dateEnd.addEventListener("change", () => {
    state.filters.dateEnd = dateEnd.value ? new Date(dateEnd.value) : null;
    updateAll();
  });

  // Dropdowns (collision-side)
  const selPolice = document.getElementById("selPolice");
  const selHighway = document.getElementById("selHighway");
  const selRoadType = document.getElementById("selRoadType");
  const selSpeed = document.getElementById("selSpeed");

  const uniq = arr => Array.from(new Set(arr)).filter(v => v !== undefined && v !== null && v !== "").sort((a,b)=>d3.ascending(a,b));

  populateSelect(selPolice, uniq(collisions.map(d => String(d.police_force))));
  populateSelect(selHighway, uniq(collisions.map(d => String(d.local_authority_highway_current))));
  populateSelect(selRoadType, uniq(collisions.map(d => String(d.road_type))));
  populateSelect(selSpeed, uniq(collisions.map(d => String(d.speed_limit))));

  selPolice.addEventListener("change", () => { state.filters.police_force = selPolice.value; updateAll(); });
  selHighway.addEventListener("change", () => { state.filters.highway = selHighway.value; updateAll(); });
  selRoadType.addEventListener("change", () => { state.filters.road_type = selRoadType.value; updateAll(); });
  selSpeed.addEventListener("change", () => { state.filters.speed_limit = selSpeed.value; updateAll(); });

  // Dropdowns (casualty-side)
  const selSex = document.getElementById("selSex");
  const selAgeBand = document.getElementById("selAgeBand");
  const selClass = document.getElementById("selClass");

  populateSelect(selSex, ["Male","Female","Unknown"]);
  populateSelect(selAgeBand, ["0–15","16–24","25–59","60+","Unknown"]);
  populateSelect(selClass, ["Driver/Rider","Passenger","Pedestrian","Unknown"]);

  selSex.addEventListener("change", () => { state.filters.sex = selSex.value; updateAll(); });
  selAgeBand.addEventListener("change", () => { state.filters.ageBand = selAgeBand.value; updateAll(); });
  selClass.addEventListener("change", () => { state.filters.casualty_class = selClass.value; updateAll(); });

  // Clear
  document.getElementById("btnClear").addEventListener("click", () => {
    selPolice.value = "All"; state.filters.police_force = "All";
    selHighway.value = "All"; state.filters.highway = "All";
    selRoadType.value = "All"; state.filters.road_type = "All";
    selSpeed.value = "All"; state.filters.speed_limit = "All";
    selSex.value = "All"; state.filters.sex = "All";
    selAgeBand.value = "All"; state.filters.ageBand = "All";
    selClass.value = "All"; state.filters.casualty_class = "All";

    dateStart.value = toISO(minD); dateEnd.value = toISO(maxD);
    state.filters.dateStart = minD; state.filters.dateEnd = maxD;

    // severity reset
    state.filters.severities = new Set(["Fatal","Serious","Slight"]);
    document.querySelectorAll("#severityButtons .btn-chip").forEach(b => b.classList.add("active"));

    // metric reset
    state.filters.heatMetric = "count";
    document.querySelectorAll("#metricButtons .btn-chip").forEach(b => b.classList.remove("active"));
    document.querySelector('#metricButtons .btn-chip[data-metric="count"]').classList.add("active");

    updateAll();
  });
}

function initCharts(){
  charts.severity = createSeverityBarChart("#chartSeverity");
  charts.classStack = createClassStacked100("#chartClassStack");
  charts.heatAgeClass = createHeatmap("#chartHeatAgeClass");
  charts.types = createTopTypesBar("#chartTypes");
  charts.timeHeat = createTimeHeatmap("#chartTimeHeat");

  // Re-render on resize
  window.addEventListener("resize", () => updateAll());
}

function applyFilters(){
  const {collisions, casualtiesEnriched} = state.data;
  const f = state.filters;

  // Collision-side filter first
  const colFiltered = collisions.filter(d => {
    if (f.dateStart && d._date && d._date < f.dateStart) return false;
    if (f.dateEnd && d._date && d._date > f.dateEnd) return false;
    if (f.police_force !== "All" && String(d.police_force) !== f.police_force) return false;
    if (f.highway !== "All" && String(d.local_authority_highway_current) !== f.highway) return false;
    if (f.road_type !== "All" && String(d.road_type) !== f.road_type) return false;
    if (f.speed_limit !== "All" && String(d.speed_limit) !== f.speed_limit) return false;
    return true;
  });

  const colSet = new Set(colFiltered.map(d => d.collision_index));

  // Casualty-side + severity selection
  const casFiltered = casualtiesEnriched.filter(d => {
    if (!colSet.has(d.collision_index)) return false;

    if (f.sex !== "All" && d._sexLabel !== f.sex) return false;
    if (f.ageBand !== "All" && d._ageBand !== f.ageBand) return false;
    if (f.casualty_class !== "All" && d._classLabel !== f.casualty_class) return false;
    if (!f.severities.has(d._sevLabel)) return false;

    return true;
  });

  return { colFiltered, casFiltered };
}

function updateAll(){
  const { colFiltered, casFiltered } = applyFilters();

  // KPIs
  d3.select("#kpiCas").text(fmtInt(casFiltered.length));
  d3.select("#kpiCol").text(fmtInt(colFiltered.length));

  const sevCounts = d3.rollup(casFiltered, v => v.length, d => d._sevLabel);
  const fatal = sevCounts.get("Fatal") || 0;
  const serious = sevCounts.get("Serious") || 0;
  const slight = sevCounts.get("Slight") || 0;
  d3.select("#kpiSev").text(`${fmtInt(fatal)} / ${fmtInt(serious)} / ${fmtInt(slight)}`);

  // Chart: severity bar
  charts.severity.update(sevCounts);

  // Chart: class x severity stacked 100
  const classRoll = d3.rollups(
    casFiltered,
    v => d3.rollup(v, w => w.length, d => d._sevLabel),
    d => d._classLabel
  ).map(([cls, m]) => ({
    classLabel: cls,
    Fatal: m.get("Fatal") || 0,
    Serious: m.get("Serious") || 0,
    Slight: m.get("Slight") || 0
  }));
  charts.classStack.update(classRoll);

  // Chart: heatmap age band x class
  const cellsMap = new Map();
  casFiltered.forEach(d => {
    const key = d._classLabel + "|" + d._ageBand;
    let obj = cellsMap.get(key);
    if (!obj){
      obj = {x: d._classLabel, y: d._ageBand, total: 0, ksi: 0, count: 0, ksiShare: 0};
      cellsMap.set(key, obj);
    }
    obj.total += 1;
    obj.count += 1;
    if (d._sevLabel === "Fatal" || d._sevLabel === "Serious") obj.ksi += 1;
  });
  const cells = Array.from(cellsMap.values()).map(d => ({...d, ksiShare: d.total ? d.ksi / d.total : 0}));
  charts.heatAgeClass.update(cells, state.filters.heatMetric);

  // Chart: top casualty types
  const typeCounts = d3.rollups(casFiltered, v => v.length, d => d._typeLabel)
    .map(([key, value]) => ({key, value}))
    .sort((a,b) => d3.descending(a.value,b.value))
    .slice(0, 10);
  charts.types.update(typeCounts);

  // Time heatmap view
  const timeMap = new Map();
  casFiltered.forEach(d => {
    const day = d._dayName;
    const hour = d._hourStr;
    if (!day || !hour) return;
    const key = day + "|" + hour;
    timeMap.set(key, (timeMap.get(key) || 0) + 1);
  });

  const timeCells = [];
  const yDomain = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const xDomain = d3.range(0,24).map(d => String(d).padStart(2,"0"));
  yDomain.forEach(day => {
    xDomain.forEach(hour => {
      timeCells.push({day, hour, value: timeMap.get(day + "|" + hour) || 0});
    });
  });
  charts.timeHeat.update(timeCells);
}

// --- Load data and bootstrap
async function init(){
  initTabs();
  initSwitchers();

  const [collisionsRaw, casualtiesRaw] = await Promise.all([
    d3.csv("data/collisions_2024.csv", d3.autoType),
    d3.csv("data/casualties_2024.csv", d3.autoType)
  ]);

  // Parse collisions date/time
  const collisions = collisionsRaw.map(d => {
    const _date = d.date ? parseDate(d.date) : null;
    let _hour = null;
    let _hourStr = null;
    if (d.time && typeof d.time === "string" && d.time.includes(":")){
      _hour = +d.time.slice(0,2);
      _hourStr = String(_hour).padStart(2,"0");
    }
    return {...d, _date, _hour, _hourStr};
  });

  const colById = new Map(collisions.map(d => [d.collision_index, d]));

  // Enrich casualties with collision fields + derived labels
  const casualtiesEnriched = casualtiesRaw.map(c => {
    const col = colById.get(c.collision_index) || {};
    const day = dayNames.get(+col.day_of_week) ?? null;

    const hourStr = col._hourStr ?? null;

    return {
      ...col,
      ...c,
      _sevLabel: sevLabel(c.casualty_severity),
      _classLabel: classLabel(c.casualty_class),
      _sexLabel: sexLabel(c.sex_of_casualty),
      _ageBand: ageBandDerived(c.age_of_casualty),
      _typeLabel: casualtyTypeLabel(c.casualty_type),
      _dayName: day ? (day === "Sun" ? "Sun" : day) : null,
      _hourStr: hourStr
    };
  });

  state.data.collisions = collisions;
  state.data.casualties = casualtiesRaw;
  state.data.casualtiesEnriched = casualtiesEnriched;

  initFiltersFromData(collisions, casualtiesEnriched);
  initCharts();
  updateAll();
}

init().catch(err => {
  console.error(err);
  alert("Failed to load data. Make sure you're running via a local web server (not file://). See README.");
});
