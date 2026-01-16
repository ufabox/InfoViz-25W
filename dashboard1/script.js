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

// Active vehicle filters
let activeVehicleFilters = new Set(['Cars & Taxis', 'Motorcycles', 'Buses & Minibuses', 'Vans & Goods', 'Agriculture / Personal', 'Special Vehicles', 'Other / Unknown']);

// Active engine CC filters
let activeEngineFilters = new Set(['cc100', 'cc500', 'cc1000', 'cc2000']);

// Active vehicle age filters
let activeVehicleAgeFilters = new Set(['age03', 'age310', 'age1020', 'age50']);

// Active month filter (empty string means all months)
let activeMonthFilter = '';

// Function to check if vehicle's engine CC matches active filters
function matchesEngineFilter(engineCC) {
    // If all filters are active, don't filter (show all)
    if (activeEngineFilters.size === 4 &&
        activeEngineFilters.has('cc100') &&
        activeEngineFilters.has('cc500') &&
        activeEngineFilters.has('cc1000') &&
        activeEngineFilters.has('cc2000')) {
        return true;
    }

    const cc = +engineCC;
    if (isNaN(cc) || cc < 0) return true; // Include vehicles with no/invalid engine CC

    if (activeEngineFilters.has('cc100') && cc <= 100) return true;
    if (activeEngineFilters.has('cc500') && cc > 100 && cc <= 500) return true;
    if (activeEngineFilters.has('cc1000') && cc > 500 && cc <= 1000) return true;
    if (activeEngineFilters.has('cc2000') && cc > 1000) return true; // Changed to include > 2000

    return false;
}

// Function to check if vehicle age matches active filters
function matchesVehicleAgeFilter(vehicleAge) {
    // If all filters are active, don't filter (show all)
    if (activeVehicleAgeFilters.size === 4 &&
        activeVehicleAgeFilters.has('age03') &&
        activeVehicleAgeFilters.has('age310') &&
        activeVehicleAgeFilters.has('age1020') &&
        activeVehicleAgeFilters.has('age50')) {
        return true;
    }

    const age = +vehicleAge;
    if (isNaN(age) || age < 0) return true; // Include vehicles with no/invalid age

    if (activeVehicleAgeFilters.has('age03') && age >= 0 && age <= 3) return true;
    if (activeVehicleAgeFilters.has('age310') && age > 3 && age <= 10) return true;
    if (activeVehicleAgeFilters.has('age1020') && age > 10 && age <= 20) return true;
    if (activeVehicleAgeFilters.has('age50') && age > 20) return true;

    return false;
}

// Function to extract month from date string (format: DD/MM/YYYY)
function getMonthFromDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('/');
    if (parts.length >= 2) {
        return parseInt(parts[1], 10); // Month is the second part
    }
    return null;
}

// Store vehicle data globally
let globalVehicleData = [];

// Function to reset all filters
function resetFilters() {
    // Reset all filter sets to include all options
    activeVehicleFilters = new Set(['Cars & Taxis', 'Motorcycles', 'Buses & Minibuses', 'Vans & Goods', 'Agriculture / Personal', 'Special Vehicles', 'Other / Unknown']);
    activeEngineFilters = new Set(['cc100', 'cc500', 'cc1000', 'cc2000']);
    activeVehicleAgeFilters = new Set(['age03', 'age310', 'age1020', 'age50']);
    activeMonthFilter = '';

    // Check all checkboxes
    ['car', 'bus', 'truck', 'bike', 'agriculture', 'cc100', 'cc500', 'cc1000', 'cc2000', 'age03', 'age310', 'age1020', 'age50'].forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = true;
    });

    // Reset month selector
    const monthSelect = document.querySelector('.month-select');
    if (monthSelect) monthSelect.value = '';

    // Refresh both charts
    drawWeatherChart();
    d3.select('#ageChart').selectAll('*').remove();
    drawAgeChart();
    // Refresh impact chart
    if (window.updateImpactChart) {
        window.updateImpactChart();
    }
    if (window.updateDistanceChart) {
        window.updateDistanceChart();
    }
    
}

//Tabs Change Method
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', function () {
        // Remove active class from all tabs and contents
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Add active class to clicked tab
        this.classList.add('active');

        // Show corresponding content
        const tabId = this.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});
//Dashboard1 Method
// Vehicle icons - keys must match the 'type' field exactly
const vehicleIcons = {
    'Cars & Taxis': '🚗',
    'Motorcycles': '🏍️',
    'Buses & Minibuses': '🚌',
    'Vans & Goods': '🚚',
    'Active / Special / Other': '🚜'
};

function drawVehicleStats() {
    const container = d3.select('#vehicleStats');

    // Load vehicle data and calculate real collision counts
    d3.csv("Raw%20Dataset/vehicles_2024.csv").then(function (vehicles) {

        // Count unique collisions per vehicle group
        const groupCollisions = {
            'Cars & Taxis': new Set(),
            'Motorcycles': new Set(),
            'Buses & Minibuses': new Set(),
            'Vans & Goods': new Set(),
            'Active / Special / Other': new Set()
        };

        vehicles.forEach(vehicle => {
            const group = vehicleGroups[vehicle.vehicle_type];
            if (group) {
                // Map special groups to the combined category
                if (group === 'Special Vehicles' || group === 'Active / Personal' || group === 'Other / Unknown') {
                    groupCollisions['Active / Special / Other'].add(vehicle.collision_index);
                } else {
                    groupCollisions[group].add(vehicle.collision_index);
                }
            }
        });

        // Convert to array format with real counts
        const vehicleData = [
            { type: 'Cars & Taxis', value: groupCollisions['Cars & Taxis'].size },
            { type: 'Motorcycles', value: groupCollisions['Motorcycles'].size },
            { type: 'Buses & Minibuses', value: groupCollisions['Buses & Minibuses'].size },
            { type: 'Vans & Goods', value: groupCollisions['Vans & Goods'].size },
            { type: 'Active / Special / Other', value: groupCollisions['Active / Special / Other'].size }
        ];

        // Clear existing content
        container.selectAll('*').remove();

        // Create cards
        const cards = container.selectAll('.stat-card')
            .data(vehicleData)
            .enter()
            .append('div')
            .attr('class', 'stat-card');

        cards.append('div')
            .attr('class', 'stat-icon')
            .style('font-size', '40px')
            .text(d => vehicleIcons[d.type] || '🚗');

        cards.append('div')
            .attr('class', 'stat-label')
            .text(d => d.type);

        cards.append('div')
            .attr('class', 'stat-value')
            .text(d => d.value.toLocaleString());

    }).catch(function (error) {
        console.error("Error loading vehicle stats:", error);
    });
}

drawVehicleStats();
// Vehicle Point of Impact Donut Chart
// Vehicle Point of Impact Donut Chart
function drawImpactChart() {
    const container = d3.select("#impactChart");
    const containerWidth = container.node().getBoundingClientRect().width || 500;
    const containerHeight = 500;

    // Clear any existing content
    container.selectAll("*").remove();

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const margin = { top: 40, right: 20, bottom: 20, left: 20 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Add title
    svg.append("text")
        .attr("x", containerWidth / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .style("fill", "#333")
        .text("Vehicle Point of Impact");

    // Create tooltip
    let tooltip = d3.select("#impact-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("id", "impact-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
    }

    // Impact point labels and colors
    const impactLabels = {
        '0': 'No Impact',
        '1': 'Front',
        '2': 'Back',
        '3': 'Offside',
        '4': 'Nearside',
        'unknown': 'Unknown Data'
    };

    // Color scale for impact points
    const colorScale = d3.scaleOrdinal()
        .domain(['1', '2', '3', '4', '0', 'unknown'])
        .range([
            '#3498db', // Front - blue
            '#e74c3c', // Back - red
            '#f39c12', // Offside - orange
            '#9b59b6', // Nearside - purple
            '#07dceb', // Did not impact - cyan
            '#7f8c8d'  // Unknown/Missing - dark gray
        ]);

    // Function to count collisions by impact point
    function countByImpact(vehicles) {
        const impactCounts = {
            '0': 0,
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            'unknown': 0
        };

        const uniqueCollisions = {};

        vehicles.forEach(vehicle => {
            const impact = vehicle.first_point_of_impact || '-1';
            const collisionId = vehicle.collision_index;

            // Normalize impact code
            const normalizedImpact = impact.trim();

            // Track unique collisions per impact point
            if (!uniqueCollisions[collisionId]) {
                uniqueCollisions[collisionId] = new Set();
            }
            
            // Map '9' and '-1' to 'unknown'
            if (normalizedImpact === '9' || normalizedImpact === '-1' || !impactCounts.hasOwnProperty(normalizedImpact)) {
                uniqueCollisions[collisionId].add('unknown');
            } else if (impactCounts.hasOwnProperty(normalizedImpact)) {
                uniqueCollisions[collisionId].add(normalizedImpact);
            }
        });

        // Count collisions for each impact point
        Object.keys(uniqueCollisions).forEach(collisionId => {
            uniqueCollisions[collisionId].forEach(impact => {
                impactCounts[impact]++;
            });
        });

        // Convert to array and filter out zero counts
        return Object.keys(impactCounts)
            .map(code => ({
                code: code,
                label: impactLabels[code],
                count: impactCounts[code]
            }))
            .filter(d => d.count > 0);
    }

    // Function to update chart
    function updateChart(impactData) {
        const total = d3.sum(impactData, d => d.count);

        // Clear previous chart content
        chart.selectAll("*").remove();

        // Create hierarchical data structure for treemap
        const hierarchicalData = {
            name: "Impact Points",
            children: impactData.map(d => ({
                name: d.label,
                code: d.code,
                value: d.count
            }))
        };

        // Create treemap layout
        const treemap = d3.treemap()
            .size([width, height])
            .padding(2)
            .round(true);

        // Create hierarchy
        const root = d3.hierarchy(hierarchicalData)
            .sum(d => d.value)
            .sort((a, b) => b.value - a.value);

        // Generate treemap
        treemap(root);

        // Create cells
        const cells = chart.selectAll("g")
            .data(root.leaves())
            .enter()
            .append("g")
            .attr("transform", d => `translate(${d.x0},${d.y0})`);

        // Add rectangles
        cells.append("rect")
            .attr("width", 0)
            .attr("height", 0)
            .attr("fill", d => colorScale(d.data.code))
            .attr("stroke", "white")
            .attr("stroke-width", 2)
            .style("opacity", 0.85)
            .on("mouseover", function (event, d) {
                d3.select(this)
                    .style("opacity", 1)
                    .attr("stroke-width", 3);

                const percentage = ((d.data.value / total) * 100).toFixed(1);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.data.name}</strong><br/>Collisions: ${d.data.value.toLocaleString()}<br/>Percentage: ${percentage}%`);
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this)
                    .style("opacity", 0.85)
                    .attr("stroke-width", 2);

                tooltip.style("visibility", "hidden");
            })
            .transition()
            .duration(800)
            .attr("width", d => d.x1 - d.x0)
            .attr("height", d => d.y1 - d.y0);

        // Add labels - impact type
        cells.append("text")
            .attr("x", d => (d.x1 - d.x0) / 2)
            .attr("y", d => (d.y1 - d.y0) / 2 - 10)
            .attr("text-anchor", "middle")
            .style("font-size", d => {
                const cellWidth = d.x1 - d.x0;
                return cellWidth > 80 ? "13px" : "11px";
            })
            .style("font-weight", "bold")
            .style("fill", "white")
            .style("opacity", 0)
            .text(d => d.data.name)
            .transition()
            .delay(800)
            .duration(400)
            .style("opacity", 1);

        // Add count labels
        cells.append("text")
            .attr("x", d => (d.x1 - d.x0) / 2)
            .attr("y", d => (d.y1 - d.y0) / 2 + 8)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "white")
            .style("opacity", 0)
            .text(d => d.data.value.toLocaleString())
            .transition()
            .delay(800)
            .duration(400)
            .style("opacity", 0.9);

        // Add percentage labels
        cells.append("text")
            .attr("x", d => (d.x1 - d.x0) / 2)
            .attr("y", d => (d.y1 - d.y0) / 2 + 23)
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("fill", "white")
            .style("opacity", 0)
            .text(d => {
                const percentage = ((d.data.value / total) * 100).toFixed(1);
                return `${percentage}%`;
            })
            .transition()
            .delay(800)
            .duration(400)
            .style("opacity", 0.8);
    }

    // Load vehicles and collisions data
    Promise.all([
        d3.csv("Raw%20Dataset/vehicles_2024.csv"),
        d3.csv("Raw%20Dataset/collisions_2024.csv")
    ]).then(function ([vehicles, collisions]) {

        // Function to get filtered vehicles based on active filters
        function getFilteredVehicles() {
            if (typeof activeVehicleFilters === 'undefined' || activeVehicleFilters.size === 0) return vehicles;

            let filteredVehicles = vehicles.filter(vehicle => {
                const vehicleType = vehicle.vehicle_type;
                const group = vehicleGroups[vehicleType];
                const matchesVehicle = group && activeVehicleFilters.has(group);
                const matchesEngine = matchesEngineFilter(vehicle.engine_capacity_cc);
                const matchesAge = matchesVehicleAgeFilter(vehicle.age_of_vehicle);

                return matchesVehicle && matchesEngine && matchesAge;
            });

            // Apply month filter if set
            if (typeof activeMonthFilter !== 'undefined' && activeMonthFilter !== '') {
                const validCollisionIds = new Set();
                collisions.forEach(collision => {
                    const collisionMonth = getMonthFromDate(collision.date);
                    if (collisionMonth === parseInt(activeMonthFilter)) {
                        validCollisionIds.add(collision.collision_index);
                    }
                });

                filteredVehicles = filteredVehicles.filter(vehicle =>
                    validCollisionIds.has(vehicle.collision_index)
                );
            }

            return filteredVehicles;
        }

        // Initial draw
        const initialData = countByImpact(getFilteredVehicles());
        updateChart(initialData);

        // Store update function globally so filters can refresh this chart
        window.updateImpactChart = function () {
            const filteredData = countByImpact(getFilteredVehicles());
            updateChart(filteredData);
        };

    }).catch(function (error) {
        console.error("Error loading impact data:", error);
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#e74c3c")
            .text("Error loading impact data");
    });
}

// Initialize impact chart
drawImpactChart();



//                                 Weather Conditions Bar Chart
function drawWeatherChart() {

    let tooltip = d3.select("#tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("id", "tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "14px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
    }

    // Set up SVG and chart
    const container = d3.select("#weatherChart");
    const containerWidth = container.node().getBoundingClientRect().width || 400;
    const containerHeight = 350;


    container.selectAll("*").remove();

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const margin = { top: 20, right: 80, bottom: 60, left: 120 };
    const chartWidth = containerWidth - margin.left - margin.right;
    const chartHeight = containerHeight - margin.top - margin.bottom;

    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const weatherLabels = {
        '1': 'Fine',
        '2': 'Raining',
        '3': 'Snowing',
        '4': 'Fine + high winds',
        '5': 'Raining + high winds',
        '6': 'Snowing + high winds',
        '7': 'Fog / mist',
        '8': 'Other',
        '9': 'Unknown'
    };

    const colorScale = d3.scaleOrdinal()
        .domain(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
        .range([
            '#f1c40f', // Fine (sunny yellow)
            '#3498db', // Raining (rain blue)
            '#85c1e9', // Snowing (icy light blue)
            '#f39c12', // Fine + high winds (windy yellow/orange)
            '#2e86c1', // Raining + high winds (dark rain blue)
            '#5dade2', // Snowing + high winds (cold blue)
            '#bdc3c7', // Fog / mist (fog gray)
            '#e67e22', // Other (orange – attention)
            '#7f8c8d'  // Unknown (neutral gray)
        ]);

    // Scale x
    const x = d3.scaleLinear().range([0, chartWidth]);

    // Scale y
    const y = d3.scaleBand().range([0, chartHeight]).padding(0.3);

    // Func to count collisions by weather condition
    function countByWeather(data) {
        const counts = {};
        const uniqueCollisions = new Set();

        data.forEach(row => {
            const weather = row.weather_conditions;
            const collisionId = row.collision_index;

            // Count unique collisions per weather condition
            const key = weather + '_' + collisionId;
            if (!uniqueCollisions.has(key)) {
                uniqueCollisions.add(key);
                if (!counts[weather]) {
                    counts[weather] = 0;
                }
                counts[weather]++;
            }
        });

        // Convert to array
        const countWeatherArr = [];
        for (let code = 1; code <= 9; code++) {
            const key = String(code);
            if (counts[key]) {
                countWeatherArr.push({
                    weather: key,
                    label: weatherLabels[key],
                    count: counts[key]
                });
            }
        }
        return countWeatherArr;
    }

    // Function to draw and update chart
    function updateChart(chartData) {

        y.domain(chartData.map(d => d.label));
        x.domain([0, d3.max(chartData, d => d.count)]).nice();

        const bars = chart.selectAll("rect")
            .data(chartData, d => d.label);

        // Remove old bars
        bars.exit()
            .transition()
            .duration(500)
            .attr("width", 0)
            .remove();

        // Update existing bars
        bars.transition()
            .duration(750)
            .attr("y", d => y(d.label))
            .attr("width", d => x(d.count))
            .attr("height", y.bandwidth())
            .attr("fill", d => colorScale(d.weather));

        // Add new bars
        bars.enter()
            .append("rect")
            .attr("x", 0)
            .attr("y", d => y(d.label))
            .attr("width", 0)
            .attr("height", y.bandwidth())
            .attr("fill", d => colorScale(d.weather))
            .attr("rx", 3)
            .attr("ry", 3)
            .on("mouseover", function (event, d) {
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.label}</strong><br/>Collisions: ${d.count.toLocaleString()}`);
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                tooltip.style("visibility", "hidden");
            })
            .transition()
            .duration(750)
            .attr("width", d => x(d.count));

        // Update value labels with data join
        const labels = chart.selectAll(".value-label")
            .data(chartData, d => d.label);

        // Remove old labels
        labels.exit()
            .transition()
            .duration(500)
            .style("opacity", 0)
            .remove();

        // Update existing labels
        labels.transition()
            .duration(750)
            .attr("x", d => x(d.count) + 5)
            .attr("y", d => y(d.label) + y.bandwidth() / 2)
            .text(d => d.count.toLocaleString());

        // Add new labels
        labels.enter()
            .append("text")
            .attr("class", "value-label")
            .attr("x", d => x(d.count) + 5)
            .attr("y", d => y(d.label) + y.bandwidth() / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "start")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", "#2c3e50")
            .style("opacity", 0)
            .text(d => d.count.toLocaleString())
            .transition()
            .duration(750)
            .style("opacity", 1);

        // Remove old axes
        chart.selectAll(".x-axis").remove();
        chart.selectAll(".y-axis").remove();

        // Draw axes
        chart.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${chartHeight})`)
            .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(",d")))
            .selectAll("text")
            .style("font-size", "10px");

        chart.append("g")
            .attr("class", "y-axis")
            .call(d3.axisLeft(y))
            .selectAll("text")
            .style("font-size", "11px")
            .on("mouseover", function (event, d) {
                const dataPoint = chartData.find(item => item.label === d);
                if (dataPoint) {
                    tooltip.style("visibility", "visible")
                        .html(`<strong>${dataPoint.label}</strong><br/>Collisions: ${dataPoint.count.toLocaleString()}`);
                }
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                tooltip.style("visibility", "hidden");
            });
    }

    // Load both collision and vehicle data
    Promise.all([
        d3.csv("Raw%20Dataset/collisions_2024.csv"),
        d3.csv("Raw%20Dataset/vehicles_2024.csv")
    ]).then(function ([collisions, vehicles]) {
        globalVehicleData = vehicles;

        // Function to filter collisions by active vehicle types
        function getFilteredCollisions() {
            if (activeVehicleFilters.size === 0) return [];

            // Get collision IDs that match the active vehicle filters
            const validCollisionIds = new Set();
            vehicles.forEach(vehicle => {
                const vehicleType = vehicle.vehicle_type;
                const group = vehicleGroups[vehicleType];
                const matchesVehicle = group && activeVehicleFilters.has(group);
                const matchesEngine = matchesEngineFilter(vehicle.engine_capacity_cc);
                const matchesAge = matchesVehicleAgeFilter(vehicle.age_of_vehicle);

                if (matchesVehicle && matchesEngine && matchesAge) {
                    validCollisionIds.add(vehicle.collision_index);
                }
            });

            // Filter collisions by collision IDs and month
            return collisions.filter(collision => {
                const matchesVehicle = validCollisionIds.has(collision.collision_index);

                // Check month filter
                if (activeMonthFilter !== '') {
                    const collisionMonth = getMonthFromDate(collision.date);
                    const matchesMonth = collisionMonth === parseInt(activeMonthFilter);
                    return matchesVehicle && matchesMonth;
                }

                return matchesVehicle;
            });
        }

        const initialData = countByWeather(getFilteredCollisions());
        updateChart(initialData);

        // Setup filter event listeners
        ['car', 'bus', 'truck', 'bike', 'agriculture'].forEach(filterId => {
            const checkbox = document.getElementById(filterId);
            if (checkbox) {
                checkbox.addEventListener('change', function () {
                    // Update active filters based on checkbox mapping
                    if (filterId === 'car') {
                        if (this.checked) activeVehicleFilters.add('Cars & Taxis');
                        else activeVehicleFilters.delete('Cars & Taxis');
                    } else if (filterId === 'bike') {
                        if (this.checked) activeVehicleFilters.add('Motorcycles');
                        else activeVehicleFilters.delete('Motorcycles');
                    } else if (filterId === 'bus') {
                        if (this.checked) activeVehicleFilters.add('Buses & Minibuses');
                        else activeVehicleFilters.delete('Buses & Minibuses');
                    } else if (filterId === 'truck') {
                        if (this.checked) activeVehicleFilters.add('Vans & Goods');
                        else activeVehicleFilters.delete('Vans & Goods');
                    } else if (filterId === 'agriculture') {
                        if (this.checked) {
                            activeVehicleFilters.add('Special Vehicles');
                            activeVehicleFilters.add('Active / Personal');
                            activeVehicleFilters.add('Other / Unknown');
                        } else {
                            activeVehicleFilters.delete('Special Vehicles');
                            activeVehicleFilters.delete('Active / Personal');
                            activeVehicleFilters.delete('Other / Unknown');
                        }
                    }

                    // Refresh weather chart
                    const filteredData = countByWeather(getFilteredCollisions());
                    updateChart(filteredData);
                    // Refresh impact chart
                    if (window.updateImpactChart) {
                        window.updateImpactChart();
                    }

                    // Refresh age chart
                    d3.select('#ageChart').selectAll('*').remove();
                    drawAgeChart();
                    if (window.updateImpactChart) {
                        window.updateDistanceChart();
                    }
                });
            }
        });

        // Setup Engine CC filter event listeners
        ['cc100', 'cc500', 'cc1000', 'cc2000'].forEach(filterId => {
            const checkbox = document.getElementById(filterId);
            if (checkbox) {
                checkbox.addEventListener('change', function () {
                    // Update active engine filters
                    if (this.checked) {
                        activeEngineFilters.add(filterId);
                    } else {
                        activeEngineFilters.delete(filterId);
                    }

                    // Refresh weather chart
                    const filteredData = countByWeather(getFilteredCollisions());
                    updateChart(filteredData);
                    // Refresh impact chart
                    if (window.updateImpactChart) {
                        window.updateImpactChart();
                    }
                    if (window.updateDistanceChart) {
                        window.updateDistanceChart();
                    }
                    // Refresh age chart
                    d3.select('#ageChart').selectAll('*').remove();
                    drawAgeChart();
                });
            }
        });

        // Setup Vehicle Age filter event listeners
        ['age03', 'age310', 'age1020', 'age50'].forEach(filterId => {
            const checkbox = document.getElementById(filterId);
            if (checkbox) {
                checkbox.addEventListener('change', function () {
                    // Update active vehicle age filters
                    if (this.checked) {
                        activeVehicleAgeFilters.add(filterId);
                    } else {
                        activeVehicleAgeFilters.delete(filterId);
                    }

                    // Refresh weather chart
                    const filteredData = countByWeather(getFilteredCollisions());
                    updateChart(filteredData);
                    if (window.updateImpactChart) {
                        window.updateDistanceChart();
                    }

                    // Refresh age chart
                    d3.select('#ageChart').selectAll('*').remove();
                    drawAgeChart();
                    // Refresh impact chart
                    if (window.updateImpactChart) {
                        window.updateImpactChart();
                    }
                });
            }
        });

        // Setup Month filter event listener
        const monthSelect = document.querySelector('.month-select');
        if (monthSelect) {
            monthSelect.addEventListener('change', function () {
                activeMonthFilter = this.value;

                // Refresh weather chart
                const filteredData = countByWeather(getFilteredCollisions());
                updateChart(filteredData);

                //Refresh Vehicle Stats
                drawVehicleStats();
                if (window.updateDistanceChart) {
                    window.updateDistanceChart();
                }
                // Refresh impact chart
                if (window.updateImpactChart) {
                    window.updateImpactChart();
                }

                // Refresh age chart
                d3.select('#ageChart').selectAll('*').remove();
                drawAgeChart();
            });
        }
    }).catch(function (error) {
        console.error("Error loading the data:", error);
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#e74c3c")
            .text("Error loading weather data");
    });
}

// Initialize weather chart
drawWeatherChart();


// Distance Banding Line Chart
function drawDistanceChart() {
    const container = d3.select("#distanceChart");
    const containerWidth = container.node().getBoundingClientRect().width || 400;
    const containerHeight = 350;

    // Clear any existing content
    container.selectAll("*").remove();

    // Create tooltip
    let tooltip = d3.select("#distance-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("id", "distance-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
    }

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const margin = { top: 20, right: 30, bottom: 60, left: 80 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;

    const chart = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Distance band labels - using position index for x-axis
    const distanceBands = {
        '1': { label: '0-5 km', position: 1 },
        '2': { label: '5-10 km', position: 2 },
        '3': { label: '10-20 km', position: 3 },
        '4': { label: '20-100 km', position: 4 },
        '5': { label: '100+ km', position: 5 }
    };

    // Function to calculate appropriate interval based on max value
    function getYAxisInterval(maxValue) {
        if (maxValue <= 100) return 10;
        if (maxValue <= 500) return 50;
        if (maxValue <= 1000) return 100;
        if (maxValue <= 2500) return 250;
        if (maxValue <= 5000) return 500;
        if (maxValue <= 10000) return 1000;
        if (maxValue <= 25000) return 2500;
        if (maxValue <= 50000) return 5000;
        return 10000;
    }

    // Function to count collisions by distance band
    function countByDistance(casualties) {
        const counts = {
            '1': 0,
            '2': 0,
            '3': 0,
            '4': 0,
            '5': 0
        };

        const uniqueCollisions = new Set();

        casualties.forEach(casualty => {
            const distanceBand = casualty.casualty_distance_banding;
            const collisionId = casualty.collision_index;
            const key = distanceBand + '_' + collisionId;

            // Only count valid distance bands and unique collisions
            if (!uniqueCollisions.has(key) && counts.hasOwnProperty(distanceBand)) {
                uniqueCollisions.add(key);
                counts[distanceBand]++;
            }
        });

        // Convert to array with positions for plotting
        return Object.keys(counts).map(code => ({
            code: code,
            label: distanceBands[code].label,
            position: distanceBands[code].position,
            count: counts[code]
        }));
    }

    // Function to update chart
    function updateChart(distanceData) {
        // Calculate max value and appropriate interval
        const maxCount = d3.max(distanceData, d => d.count) || 10;
        const interval = getYAxisInterval(maxCount);
        const yMax = Math.ceil(maxCount / interval) * interval;

        // Scales - using position (1-5) instead of actual distance
        const x = d3.scaleLinear()
            .domain([0.5, 5.5])  // Padding on both sides
            .range([0, width]);

        const y = d3.scaleLinear()
            .domain([0, yMax])
            .range([height, 0]);

        // Calculate number of ticks
        const numTicks = Math.min(10, yMax / interval);

        // Grid lines
        chart.selectAll(".grid-line").remove();

        const yTickValues = [];
        for (let i = 0; i <= numTicks; i++) {
            yTickValues.push(i * interval);
        }

        chart.append("g")
            .attr("class", "grid")
            .selectAll("line")
            .data(yTickValues)
            .enter()
            .append("line")
            .attr("class", "grid-line")
            .attr("x1", 0)
            .attr("x2", width)
            .attr("y1", d => y(d))
            .attr("y2", d => y(d))
            .attr("stroke", "#e0e0e0")
            .attr("stroke-dasharray", "3,3");

        // Line generator
        const line = d3.line()
            .x(d => x(d.position))
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Area generator
        const area = d3.area()
            .x(d => x(d.position))
            .y0(height)
            .y1(d => y(d.count))
            .curve(d3.curveMonotoneX);

        // Remove old paths
        chart.selectAll(".line-path").remove();
        chart.selectAll(".area-path").remove();

        // Draw area
        chart.append("path")
            .datum(distanceData)
            .attr("class", "area-path")
            .attr("fill", "#14e12c")
            .attr("opacity", 0.6)
            .attr("d", area);

        // Draw line
        chart.append("path")
            .datum(distanceData)
            .attr("class", "line-path")
            .attr("fill", "none")
            .attr("stroke", "#e74c3c")
            .attr("stroke-width", 3)
            .attr("stroke-linejoin", "round")
            .attr("stroke-linecap", "round")
            .attr("d", line);

        // Remove old dots
        chart.selectAll(".dot").remove();
        chart.selectAll(".value-label").remove();

        // Draw dots
        chart.selectAll(".dot")
            .data(distanceData)
            .enter()
            .append("circle")
            .attr("class", "dot")
            .attr("cx", d => x(d.position))
            .attr("cy", d => y(d.count))
            .attr("r", 6)
            .attr("fill", "#e74c3c")
            .attr("stroke", "white")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")
            .on("mouseover", function (event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 8);

                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.label}</strong><br/>Collisions: ${d.count.toLocaleString()}`);
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", 6);

                tooltip.style("visibility", "hidden");
            });

        // Add value labels on dots
        chart.selectAll(".value-label")
            .data(distanceData)
            .enter()
            .append("text")
            .attr("class", "value-label")
            .attr("x", d => x(d.position))
            .attr("y", d => y(d.count) - 10)
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", "#111010")
            .text(d => d.count.toLocaleString());

        // Remove old axes
        chart.selectAll(".x-axis").remove();
        chart.selectAll(".y-axis").remove();
        chart.selectAll(".axis-label").remove();

        // X Axis with custom labels
        const xAxis = d3.axisBottom(x)
            .tickValues([1, 2, 3, 4, 5])
            .tickFormat(d => {
                const band = distanceData.find(item => item.position === d);
                return band ? band.label : '';
            });

        chart.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("font-size", "11px")
            .style("text-anchor", "middle");

        // Y Axis with dynamic intervals
        const yAxis = d3.axisLeft(y)
            .tickValues(yTickValues)
            .tickFormat(d => d.toLocaleString());

        chart.append("g")
            .attr("class", "y-axis")
            .call(yAxis)
            .selectAll("text")
            .style("font-size", "11px");

        // X Axis Label
        chart.append("text")
            .attr("class", "axis-label")
            .attr("x", width / 2)
            .attr("y", height + 45)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Distance from Casualty's Home");

        // Y Axis Label
        chart.append("text")
            .attr("class", "axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -height / 2)
            .attr("y", -60)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#666")
            .text("Number of Collisions");
    }

    // Load casualties, collisions, and vehicle data
    Promise.all([
        d3.csv("Raw%20Dataset/casualties_2024.csv"),
        d3.csv("Raw%20Dataset/collisions_2024.csv"),
        d3.csv("Raw%20Dataset/vehicles_2024.csv")
    ]).then(function ([casualties, collisions, vehicles]) {

        // Function to filter casualties based on active filters
        function getFilteredCasualties() {
            if (activeVehicleFilters.size === 0) return [];

            // Get collision IDs that match the active vehicle filters
            const validCollisionIds = new Set();
            vehicles.forEach(vehicle => {
                const vehicleType = vehicle.vehicle_type;
                const group = vehicleGroups[vehicleType];
                const matchesVehicle = group && activeVehicleFilters.has(group);
                const matchesEngine = matchesEngineFilter(vehicle.engine_capacity_cc);
                const matchesAge = matchesVehicleAgeFilter(vehicle.age_of_vehicle);

                if (matchesVehicle && matchesEngine && matchesAge) {
                    validCollisionIds.add(vehicle.collision_index);
                }
            });

            // Filter by month if selected
            let filteredCollisionIds = validCollisionIds;
            if (activeMonthFilter !== '') {
                filteredCollisionIds = new Set();
                collisions.forEach(collision => {
                    if (validCollisionIds.has(collision.collision_index)) {
                        const collisionMonth = getMonthFromDate(collision.date);
                        if (collisionMonth === parseInt(activeMonthFilter)) {
                            filteredCollisionIds.add(collision.collision_index);
                        }
                    }
                });
            }

            // Filter casualties by the filtered collision IDs
            return casualties.filter(casualty =>
                filteredCollisionIds.has(casualty.collision_index)
            );
        }

        // Initial draw
        const initialData = countByDistance(getFilteredCasualties());
        updateChart(initialData);

        // Store update function globally so filters can refresh this chart
        window.updateDistanceChart = function () {
            const filteredData = countByDistance(getFilteredCasualties());
            updateChart(filteredData);
        };

    }).catch(function (error) {
        console.error("Error loading distance data:", error);
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#e74c3c")
            .text("Error loading distance data");
    });
}

// Initialize distance chart
drawDistanceChart();

//                                 Driver Age Groups Pie Chart
function drawAgeChart() {
    const container = d3.select("#ageChart");
    const containerWidth = container.node().getBoundingClientRect().width || 400;
    const containerHeight = 350;

    // Clear any existing content
    container.selectAll("*").remove();

    const svg = container.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const width = containerWidth - margin.left - margin.right;
    const height = containerHeight - margin.top - margin.bottom;
    const radius = Math.min(width, height) / 2;

    const chart = svg.append("g")
        .attr("transform", `translate(${containerWidth / 2},${containerHeight / 2})`);

    // Create tooltip
    let tooltip = d3.select("#age-pie-tooltip");
    if (tooltip.empty()) {
        tooltip = d3.select("body").append("div")
            .attr("id", "age-pie-tooltip")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "rgba(0, 0, 0, 0.8)")
            .style("color", "white")
            .style("padding", "10px")
            .style("border-radius", "5px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("z-index", "1000");
    }

    // Color scale for age groups
    const colorScale = d3.scaleOrdinal()
        .domain(['<18', '18-25', '25-55', '>55', 'Unknown'])
        .range(['#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#95a5a6']);

    // Function to categorize actual age to age group
    function getAgeGroup(age) {
        const ageNum = +age;
        if (isNaN(ageNum) || ageNum < 0) return 'Unknown';
        if (ageNum < 18) return '<18';
        if (ageNum >= 18 && ageNum <= 25) return '18-25';
        if (ageNum > 25 && ageNum <= 55) return '25-55';
        if (ageNum > 55) return '>55';
        return 'Unknown';
    }

    // Function to count collisions by age group
    function countByAgeGroup(data) {
        const groupCounts = {
            '<18': 0,
            '18-25': 0,
            '25-55': 0,
            '>55': 0,
            'Unknown': 0
        };

        const uniqueCollisions = {};

        data.forEach(row => {
            const age = row.age_of_driver;
            const collisionId = row.collision_index;
            const ageGroup = getAgeGroup(age);

            // Track unique collisions per age group
            if (!uniqueCollisions[collisionId]) {
                uniqueCollisions[collisionId] = new Set();
            }
            uniqueCollisions[collisionId].add(ageGroup);
        });

        // Count collisions for each age group
        Object.keys(uniqueCollisions).forEach(collisionId => {
            uniqueCollisions[collisionId].forEach(group => {
                groupCounts[group]++;
            });
        });

        // Convert to array
        return Object.keys(groupCounts).map(group => ({
            group: group,
            count: groupCounts[group]
        })).filter(d => d.count > 0);
    }

    // Pie generator
    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);

    // Arc generator
    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius - 20);

    // Arc for hover effect
    const arcHover = d3.arc()
        .innerRadius(0)
        .outerRadius(radius - 10);

    // Load and process data
    d3.csv("Raw%20Dataset/vehicles_2024.csv").then(function (data) {
        // Filter vehicles by active vehicle type filters, engine CC filters, AND vehicle age filters
        const filteredData = data.filter(vehicle => {
            const group = vehicleGroups[vehicle.vehicle_type];
            const matchesVehicle = group && activeVehicleFilters.has(group);
            const matchesEngine = matchesEngineFilter(vehicle.engine_capacity_cc);
            const matchesAge = matchesVehicleAgeFilter(vehicle.age_of_vehicle);
            return matchesVehicle && matchesEngine && matchesAge;
        });

        const ageData = countByAgeGroup(filteredData);
        const total = d3.sum(ageData, d => d.count);

        // Create pie slices
        const slices = chart.selectAll(".arc")
            .data(pie(ageData))
            .enter()
            .append("g")
            .attr("class", "arc");

        slices.append("path")
            .attr("d", arc)
            .attr("fill", d => colorScale(d.data.group))
            .attr("stroke", "white")
            .attr("stroke-width", 2)
            .style("opacity", 0.9)
            .on("mouseover", function (event, d) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("d", arcHover)
                    .style("opacity", 1);

                const percentage = ((d.data.count / total) * 100).toFixed(1);
                tooltip.style("visibility", "visible")
                    .html(`<strong>${d.data.group}</strong><br/>Collisions: ${d.data.count.toLocaleString()}<br/>Percentage: ${percentage}%`);
            })
            .on("mousemove", function (event) {
                tooltip.style("top", (event.pageY - 10) + "px")
                    .style("left", (event.pageX + 10) + "px");
            })
            .on("mouseout", function () {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("d", arc)
                    .style("opacity", 0.9);

                tooltip.style("visibility", "hidden");
            })
            .transition()
            .duration(1000)
            .attrTween("d", function (d) {
                const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
                return function (t) {
                    return arc(interpolate(t));
                };
            });

        // Add labels
        slices.append("text")
            .attr("transform", d => `translate(${arc.centroid(d)})`)
            .attr("text-anchor", "middle")
            .style("font-size", "11px")
            .style("font-weight", "bold")
            .style("fill", "white")
            .style("opacity", 0)
            .text(d => {
                const percentage = ((d.data.count / total) * 100);
                return percentage > 5 ? `${percentage.toFixed(1)}%` : '';
            })
            .transition()
            .delay(1000)
            .duration(500)
            .style("opacity", 1);

        // Add legend
        const legend = svg.append("g")
            .attr("transform", `translate(20, 20)`);

        const legendItems = legend.selectAll(".legend-item")
            .data(ageData)
            .enter()
            .append("g")
            .attr("class", "legend-item")
            .attr("transform", (d, i) => `translate(0, ${i * 20})`);

        legendItems.append("rect")
            .attr("width", 12)
            .attr("height", 12)
            .attr("fill", d => colorScale(d.group))
            .attr("rx", 2);

        legendItems.append("text")
            .attr("x", 18)
            .attr("y", 10)
            .style("font-size", "11px")
            .style("fill", "#333")
            .text(d => `${d.group}`);

    }).catch(function (error) {
        console.error("Error loading the data:", error);
        container.append("div")
            .style("padding", "20px")
            .style("text-align", "center")
            .style("color", "#e74c3c")
            .text("Error loading age data");
    });
}

// Initialize age chart
drawAgeChart();


// Setup reset button event listener
document.addEventListener('DOMContentLoaded', function () {
    const resetButton = document.getElementById('resetFilters');
    if (resetButton) {
        resetButton.addEventListener('click', resetFilters);
    }
});