import * as d3 from 'd3';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const events = [
    { date: new Date('2021-01-01'), title: 'New Year', lat: 40.7128, lng: -74.0060 }, // New York coordinates
    { date: new Date('2021-07-04'), title: 'Independence Day', lat: 38.9072, lng: -77.0369 }, // Washington D.C. coordinates
    // Add more events with their respective coordinates
];

// Dimensions for the world map
const mapWidth = document.getElementById('world-map').clientWidth;
const mapHeight = document.getElementById('world-map').clientHeight;

// Create SVG for the world map
const mapSvg = d3.select('#world-map').append('svg')
    .attr('width', mapWidth)
    .attr('height', mapHeight);

// Load and display the world map
d3.json('/world.geojson').then(mapData => { // Define a projection
 // Define a projection
    const projection = d3.geoNaturalEarth1()
        .fitSize([mapWidth, mapHeight], mapData);

    // Define a path generator based on the projection
    const path = d3.geoPath().projection(projection);

    mapSvg.selectAll('path')
        .data(mapData.features)
        .enter().append('path')
            .attr('d', path)
            .attr('fill', '#ccc') // Style as needed
            .attr('stroke', '#333'); // Style as needed
    
     // Display dots for each event
    mapSvg.selectAll(".event-dot")
        .data(events)
        .enter().append("circle")
            .attr("class", "event-dot")
            .attr("cx", d => projection([d.lng, d.lat])[0])
            .attr("cy", d => projection([d.lng, d.lat])[1])
            .attr("r", 5) // Radius of the dots
            .attr("fill", "red"); // Color of the dots
});

// Dimensions
const width = document.getElementById('timeline').clientWidth;
const height = document.getElementById('timeline').clientHeight;

// Append SVG to the container
const svg = d3.select('#timeline').append('svg')
    .attr('width', width)
    .attr('height', height);

// Define time scale
const timeScale = d3.scaleTime()
    .domain([new Date('0001-01-01'), new Date()])
    .range([0, width]);

// Constants for layout
const lineLength = 30; // Length of the line extending from the dot
const textOffset = 5;  // How far the text will be from the end of the line

svg.selectAll(".event-line")
    .data(events)
    .enter().append("line")
        .attr("class", "event-line")
        .attr("x1", d => timeScale(d.date))
        .attr("y1", height / 2)
        .attr("x2", d => timeScale(d.date))
        .attr("y2", height / 2 - lineLength)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .style("visibility", "hidden");;

svg.selectAll(".event-text")
    .data(events)
    .enter().append("text")
        .attr("class", "event-text")
        .attr("x", d => timeScale(d.date))
        .attr("y", height / 2 - lineLength - textOffset)
        .attr("text-anchor", "middle") // Center the text over the line
        .text(d => d.title)
        .style("visibility", "hidden");

svg.selectAll(".event-dot")
    .data(events)
    .enter().append("circle")
        .attr("class", "event-dot")
        .attr("cx", d => timeScale(d.date))
        .attr("cy", height / 2)
        .attr("r", 5)
        .attr("fill", "blue")
    .on("mouseover", function(event, d) {
        // Show the line and text for the hovered event
        svg.selectAll(".event-line")
            .filter(e => e === d)
            .style("visibility", "visible");

        svg.selectAll(".event-text")
            .filter(e => e === d)
            .style("visibility", "visible");
    })
    .on("mouseout", function(event, d) {
        // Hide the line and text when no longer hovering
        svg.selectAll(".event-line")
            .filter(e => e === d)
            .style("visibility", "hidden");

        svg.selectAll(".event-text")
            .filter(e => e === d)
            .style("visibility", "hidden");
    });


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

    svg.selectAll(".event-dot")
        .attr("cx", d => newScale(d.date));

    svg.selectAll(".event-line")
        .attr("x1", d => newScale(d.date))
        .attr("x2", d => newScale(d.date));

    svg.selectAll(".event-text")
        .attr("x", d => newScale(d.date));
}

const zoom = d3.zoom()
    .scaleExtent([1, 1000000]) // Allows zooming to seconds
    .translateExtent([[0, 0], [width, height]])
    .on('zoom', zoomed);

svg.call(zoom);


document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch the Markdown content from the public folder
        const response = await fetch('/pages/example.md');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const markdownText = await response.text();

        // Convert Markdown to HTML
        let htmlContent = marked(markdownText);

        // Sanitize HTML content
        htmlContent = DOMPurify.sanitize(htmlContent);

        // Insert the HTML content into the div
        document.getElementById('markdown-content').innerHTML = htmlContent;
    } catch (error) {
        console.error('Error fetching the Markdown file:', error);
        // Handle errors (e.g., show a message to the user)
    }
});