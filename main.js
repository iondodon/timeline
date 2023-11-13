import * as d3 from 'd3';

// Dimensions
const width = document.getElementById('timeline').clientWidth;
const height = 200; // Adjust as needed

// Append SVG to the container
const svg = d3.select('#timeline').append('svg')
    .attr('width', width)
    .attr('height', height);

// Define time scale
const timeScale = d3.scaleTime()
    .domain([new Date(), new Date().setFullYear(new Date().getFullYear() + 1)]) // Example: today to one year from now
    .range([0, width]);

// Add an axis (optional, for visual reference)
svg.append('g')
   .attr('class', 'x-axis')
   .call(d3.axisBottom(timeScale));

// Zoom functionality
const zoomed = (event) => {
    const newXScale = event.transform.rescaleX(timeScale);
    svg.selectAll('.x-axis').call(d3.axisBottom(newXScale)); // Update the axis
}

const zoom = d3.zoom()
    .scaleExtent([0.5, 5]) // Limit zoom scale
    .translateExtent([[0, 0], [width, height]])
    .on('zoom', zoomed);

svg.call(zoom);
