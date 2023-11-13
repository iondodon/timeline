import * as d3 from 'd3';

// Dimensions
const width = document.getElementById('timeline').clientWidth;
const height = document.getElementById('timeline').clientHeight;

// Append SVG to the container
const svg = d3.select('#timeline').append('svg')
    .attr('width', width)
    .attr('height', height);

console.log(new Date())

// Define time scale
const timeScale = d3.scaleTime()
    .domain([new Date('0001-01-01'), new Date()])
    .range([0, width]);

// Add an axis (for visual reference)
const axis = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${height / 2})`)
    .call(d3.axisBottom(timeScale));

// Function to update the axis based on zoom
function updateAxis(newScale) {
    axis.call(d3.axisBottom(newScale).tickFormat(d3.timeFormat("%Y-%m-%d %H:%M:%S")));
}

// Zoom functionality
function zoomed(event) {
    const newScale = event.transform.rescaleX(timeScale);
    updateAxis(newScale);
}

const zoom = d3.zoom()
    .scaleExtent([1, 1000000]) // Allows zooming to seconds
    .translateExtent([[0, 0], [width, height]])
    .on('zoom', zoomed);

svg.call(zoom);
