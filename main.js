import * as d3 from 'd3';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const events = [
    { date: new Date('2021-01-01'), title: 'New Year', lat: 40.7128, lng: -74.0060 }, // New York coordinates
    { date: new Date('2021-07-04'), title: 'Independence Day', lat: 38.9072, lng: -77.0369 }, // Washington D.C. coordinates
    { date: new Date('0001-07-04'), title: 'Independence Day', lat: 40.9072, lng: -40.0369 }, // Washington D.C. coordinates
    // Add more events with their respective coordinates
    // Generate many events
    ...Array(1000).fill().map((_, i) => ({
        date: new Date(2000 + Math.floor(i/100), i%12, Math.floor(Math.random() * 28) + 1),
        title: `Event ${i}`,
        lat: 30 + Math.random() * 30,
        lng: -100 + Math.random() * 50
    }))
];

// Dimensions
const width = document.getElementById('timeline').clientWidth;
const height = document.getElementById('timeline').clientHeight;

// Define time scale boundaries
const minDate = new Date('0000-01-01');
const maxDate = new Date();

// Define time scale
const timeScale = d3.scaleTime()
    .domain([minDate, maxDate])
    .range([0, width - 40]); // Add some padding for the right edge

// Constants for layout
const lineLength = 30; // Length of the line extending from the dot
const textOffset = 5;  // How far the text will be from the end of the line

// Append SVG to the container with margins
const svg = d3.select('#timeline').append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(20, 0)`); // Add left margin for better visibility

// Custom time format function to handle year 0000
const customTimeFormat = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    // For year 0
    if (year === 0) {
        return `0000-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    
    // For current time, show more detail
    if (year === new Date().getFullYear()) {
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // For other years
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

// Add an axis (for visual reference)
const axis = svg.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${height / 2})`)
    .call(d3.axisBottom(timeScale).tickFormat(customTimeFormat));

// Function to update the axis based on zoom
function updateAxis(newScale) {
    axis.call(
        d3.axisBottom(newScale)
            .tickFormat(customTimeFormat)
    );
}

// Helper function to cluster events based on both time and space
function clusterEvents(events, timeScale, threshold, projection = null) {
    const clusters = [];
    const clustered = new Set();

    events.forEach((event, i) => {
        if (clustered.has(i)) return;

        const cluster = {
            events: [event],
            x: timeScale(event.date),
            count: 1,
            lat: event.lat,
            lng: event.lng
        };

        // Find nearby events (both in time and space if projection is provided)
        events.forEach((other, j) => {
            if (i !== j && !clustered.has(j)) {
                const timeDistance = Math.abs(timeScale(event.date) - timeScale(other.date));
                let shouldCluster = timeDistance < threshold;

                // If we have projection, also check spatial distance
                if (projection && shouldCluster) {
                    const p1 = projection([event.lng, event.lat]);
                    const p2 = projection([other.lng, other.lat]);
                    const spatialDistance = Math.sqrt(
                        Math.pow(p1[0] - p2[0], 2) + 
                        Math.pow(p1[1] - p2[1], 2)
                    );
                    shouldCluster = spatialDistance < 30; // Adjust this threshold as needed
                }

                if (shouldCluster) {
                    cluster.events.push(other);
                    cluster.x = (cluster.x * cluster.count + timeScale(other.date)) / (cluster.count + 1);
                    cluster.lat = (cluster.lat * cluster.count + other.lat) / (cluster.count + 1);
                    cluster.lng = (cluster.lng * cluster.count + other.lng) / (cluster.count + 1);
                    cluster.count++;
                    clustered.add(j);
                }
            }
        });

        clusters.push(cluster);
        clustered.add(i);
    });

    return clusters;
}

// Function to calculate vertical offset for overlapping labels
function calculateLabelPositions(clusters, lineHeight = 20) {
    clusters.forEach((cluster, i) => {
        cluster.yOffset = 0;
        
        // Look at previous clusters to check for overlap
        for (let j = 0; j < i; j++) {
            const prev = clusters[j];
            const xDistance = Math.abs(cluster.x - prev.x);
            
            // If labels would overlap horizontally
            if (xDistance < 100) {  // Adjust this value based on your label width
                // Offset this label by one line height
                cluster.yOffset = prev.yOffset + lineHeight;
            }
        }
    });
}

// Function to position tooltips
function positionTooltip(tooltip, event) {
    const tooltipNode = tooltip.node();
    const tooltipRect = tooltipNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate initial positions (10px offset from cursor)
    let left = event.pageX + 10;
    let top = event.pageY + 10;
    
    // Adjust horizontal position if tooltip would go beyond right edge
    if (left + tooltipRect.width > viewportWidth) {
        left = event.pageX - tooltipRect.width - 10;
    }
    
    // Adjust vertical position if tooltip would go beyond bottom edge
    if (top + tooltipRect.height > viewportHeight) {
        top = event.pageY - tooltipRect.height - 10;
    }
    
    // Ensure tooltip doesn't go beyond left or top edges
    left = Math.max(10, left);
    top = Math.max(10, top);
    
    tooltip
        .style("left", left + "px")
        .style("top", top + "px");
}

// Function to update timeline visualization
function updateVisualization(transform) {
    // Ensure we have a valid transform object
    if (!transform) {
        transform = d3.zoomTransform(svg.node());
    }

    // Calculate the new scale and threshold
    const newScale = transform.rescaleX(timeScale);
    const threshold = Math.max(20, 50 / transform.k); // Adjust threshold based on zoom level with minimum value

    // Get visible range
    const visibleRange = [
        newScale.invert(0),
        newScale.invert(width)
    ];

    // Filter events to visible range and cluster them
    const visibleEvents = events.filter(event => 
        event.date >= visibleRange[0] && event.date <= visibleRange[1]
    );
    const clusters = clusterEvents(visibleEvents, newScale, threshold);
    calculateLabelPositions(clusters);

    // Remove existing elements and tooltips
    removeAllTooltips();
    svg.selectAll(".event-group").remove();

    // Create groups for each cluster
    const eventGroups = svg.selectAll(".event-group")
        .data(clusters)
        .enter().append("g")
        .attr("class", "event-group")
        .attr("transform", d => `translate(${newScale(d.events[0].date)},0)`);

    // Add lines
    eventGroups.append("line")
        .attr("class", "event-line")
        .attr("x1", 0)
        .attr("y1", height / 2)
        .attr("x2", 0)
        .attr("y2", d => height / 2 - lineLength - d.yOffset)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .style("visibility", "hidden")
        .style("pointer-events", "none");

    // Add dots with improved event handling
    eventGroups.append("circle")
        .attr("class", "event-dot")
        .attr("cx", 0)
        .attr("cy", height / 2)
        .attr("r", d => Math.max(3, Math.min(8, Math.sqrt(d.events.length) * 3)))
        .attr("fill", d => d.events.length > 1 ? "red" : "blue")
        .style("pointer-events", "all")
        .on("mouseover", function(event, d) {
            // Remove any existing tooltips first
            removeAllTooltips();
            
            // Show the line
            d3.select(this.parentNode).select(".event-line")
                .style("visibility", "visible");
            
            // Show the text
            d3.select(this.parentNode).select(".event-text")
                .style("visibility", "visible")
                .text(d.events.length > 1 ? `${d.events.length} events` : d.events[0].title);

            // Show tooltip if it's a cluster
            if (d.events.length > 1) {
                createTooltip(event, {
                    events: d.events,
                    count: d.events.length
                });
            }
        })
        .on("mouseout", function(event, d) {
            // Use setTimeout to prevent flickering when moving between dots
            setTimeout(() => {
                // Only remove tooltip if we're not hovering over another dot
                if (!d3.select(document.elementFromPoint(event.clientX, event.clientY)).classed('event-dot')) {
                    removeAllTooltips();
                }
            }, 50);

            // Hide the line and text
            d3.select(this.parentNode).select(".event-line")
                .style("visibility", "hidden");
            d3.select(this.parentNode).select(".event-text")
                .style("visibility", "hidden");
        });

    // Add text labels
    eventGroups.append("text")
        .attr("class", "event-text")
        .attr("x", 0)
        .attr("y", d => height / 2 - lineLength - textOffset - d.yOffset)
        .attr("text-anchor", "middle")
        .style("visibility", "hidden")
        .style("pointer-events", "none")
        .text(d => d.events.length > 1 ? `${d.events.length} events` : d.events[0].title);

    // Update the axis
    updateAxis(newScale);
}

// Function to update map visualization
function updateMapVisualization(transform = null) {
    if (!mapData) return;
    
    // Ensure we have a valid transform
    if (!transform) {
        transform = d3.zoomTransform(svg.node());
    }

    const mapWidth = document.getElementById('world-map').clientWidth;
    const mapHeight = document.getElementById('world-map').clientHeight;

    // Get the current projection
    const projection = d3.geoNaturalEarth1()
        .fitSize([mapWidth, mapHeight], mapData);

    // Get visible range from timeline
    const newScale = transform.rescaleX(timeScale);
    const visibleRange = [
        newScale.invert(0),
        newScale.invert(width)
    ];

    // Filter events to visible range
    const visibleEvents = events.filter(event => 
        event.date >= visibleRange[0] && event.date <= visibleRange[1]
    );

    // Clear existing dots
    mapG.selectAll(".map-event-dot").remove();

    // Cluster events based on both time and space
    const threshold = Math.max(20, 50 / transform.k); // Adjust threshold based on zoom level with minimum value
    const clusters = clusterEvents(visibleEvents, newScale, threshold, projection);

    // Add dots for clusters
    const dots = mapG.selectAll(".map-event-dot")
        .data(clusters)
        .enter().append("circle")
        .attr("class", "map-event-dot")
        .attr("cx", d => projection([d.lng, d.lat])[0])
        .attr("cy", d => projection([d.lng, d.lat])[1])
        .attr("r", d => Math.max(3, Math.min(8, Math.sqrt(d.events.length) * 3)))
        .attr("fill", d => d.events.length > 1 ? "red" : "blue")
        .attr("opacity", 0.7)
        .on("mouseover", function(event, d) {
            // Highlight corresponding timeline event
            svg.selectAll(".event-dot")
                .filter(e => e.events.some(ev => d.events.includes(ev)))
                .attr("stroke", "#333")
                .attr("stroke-width", 2);

            // Show tooltip
            createTooltip(event, {
                events: d.events,
                count: d.events.length
            });
        })
        .on("mouseout", function() {
            // Remove highlight from timeline
            svg.selectAll(".event-dot")
                .attr("stroke", null)
                .attr("stroke-width", null);

            // Remove tooltip
            removeAllTooltips();
        });
}

// Function to remove all tooltips
function removeAllTooltips() {
    d3.selectAll('.tooltip').remove();
}

// Function to create and position tooltip
function createTooltip(event, d) {
    // Remove any existing tooltips first
    removeAllTooltips();
    
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("background", "white")
        .style("padding", "10px")
        .style("border", "1px solid black")
        .style("border-radius", "5px")
        .style("pointer-events", "none")
        .style("max-height", "300px")
        .style("overflow-y", "auto")
        .style("z-index", "1000");

    const maxEventsToShow = 10;
    const eventList = d.events
        .slice(0, maxEventsToShow)
        .map(e => `${e.title} (${e.date.toLocaleDateString()})`).join("<br>");
    
    const remainingEvents = d.events.length - maxEventsToShow;
    const showMoreText = remainingEvents > 0 ? 
        `<br><em>...and ${remainingEvents} more events</em>` : '';
    
    tooltip.html(`
        <strong>${d.count} event${d.count > 1 ? 's' : ''}</strong><br>
        ${eventList}
        ${showMoreText}
    `);
    
    positionTooltip(tooltip, event);
    return tooltip;
}

// Function to constrain transform to valid date range
function constrainTransform(transform) {
    // Calculate the visible date range after the transform
    const xMin = transform.invertX(0);
    const xMax = transform.invertX(width);
    
    // Convert x coordinates to dates
    const dateMin = timeScale.invert(xMin);
    const dateMax = timeScale.invert(xMax);
    
    // If trying to show dates before year 0000
    if (dateMin < minDate) {
        // Calculate how much we need to adjust the transform
        const xMinDesired = timeScale(minDate);
        transform.x = -xMinDesired * transform.k;
    }
    
    // If trying to show dates after current time
    if (dateMax > maxDate) {
        // Calculate how much we need to adjust the transform
        const xMaxDesired = timeScale(maxDate);
        const xMaxCurrent = timeScale.range()[1];
        transform.x = xMaxCurrent - xMaxDesired * transform.k;
    }
    
    return transform;
}

// Ensure zoomed function always updates both visualizations
function zoomed(event) {
    const constrainedTransform = constrainTransform(event.transform);
    updateVisualization(constrainedTransform);
    if (mapData) {
        updateMapVisualization(constrainedTransform);
    }
}

// Map initialization
const mapWidth = document.getElementById('world-map').clientWidth;
const mapHeight = document.getElementById('world-map').clientHeight;

// Create SVG for the world map with margins
const mapSvg = d3.select('#world-map').append('svg')
    .attr('width', mapWidth)
    .attr('height', mapHeight)
    .append('g')
    .attr('transform', `translate(10, 10)`); // Add margins for better visibility

// Add a container group for map elements that will be transformed
const mapG = mapSvg.append('g');

const mapZoom = d3.zoom()
    .scaleExtent([1, 8])
    .on('zoom', (event) => {
        mapG.attr('transform', event.transform);
    });

mapSvg.call(mapZoom);

// Load and display the world map
let mapData; // Store map data globally
d3.json('/world.geojson').then(data => {
    mapData = data;
    const projection = d3.geoNaturalEarth1()
        .fitSize([mapWidth, mapHeight], mapData);

    const path = d3.geoPath().projection(projection);

    mapG.selectAll('path')
        .data(mapData.features)
        .enter().append('path')
            .attr('d', path)
            .attr('fill', '#ccc')
            .attr('stroke', '#333');
    
    // Initialize map visualization after map data is loaded
    updateMapVisualization();
});

// Initial timeline visualization
updateVisualization();

// Timeline zoom functionality
const zoom = d3.zoom()
    .scaleExtent([1, 1000000])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, -Infinity], [width, Infinity]])
    .on('zoom', event => {
        if (event.sourceEvent && event.sourceEvent.type === 'wheel') {
            // Let the wheel event handler handle wheel-based zooming
            return;
        }
        zoomed(event);
    });

// Function to calculate zoom transform based on mouse position
function calculateZoomTransform(mouseX, currentTransform, newScale) {
    // Calculate the date under the mouse pointer
    const currentDate = timeScale.invert((mouseX - currentTransform.x) / currentTransform.k);
    
    // Calculate the new transform that keeps the date under the mouse pointer
    const targetX = mouseX - timeScale(currentDate) * newScale;
    let newTransform = d3.zoomIdentity
        .translate(targetX, 0)
        .scale(newScale);
    
    // Apply constraints
    return constrainTransform(newTransform);
}

// Apply zoom to the entire SVG
svg.call(zoom);

// Enable zoom and pan on the entire timeline div and disable text selection
const timelineDiv = d3.select('#timeline')
    .style('cursor', 'grab')
    .style('user-select', 'none')
    .style('-webkit-user-select', 'none')
    .style('-moz-user-select', 'none')
    .style('-ms-user-select', 'none');

// Also disable text selection on the SVG and its elements
svg.style('user-select', 'none')
    .style('-webkit-user-select', 'none')
    .style('-moz-user-select', 'none')
    .style('-ms-user-select', 'none');

// Handle wheel events at the SVG level
svg.on('wheel', function(event) {
    event.preventDefault(); // Prevent page scrolling
    event.stopPropagation(); // Stop event from bubbling
    
    // Get the current transform
    const transform = d3.zoomTransform(svg.node());
    
    // Calculate new scale based on wheel delta
    const delta = event.deltaY;
    const scaleFactor = delta > 0 ? 0.9 : 1.1; // Zoom out for positive delta, in for negative
    const newScale = transform.k * scaleFactor;
    
    // Ensure scale stays within bounds
    if (newScale >= 1 && newScale <= 1000000) {
        // Get mouse position relative to the SVG
        const point = d3.pointer(event, svg.node());
        const mouseX = point[0];

        // Calculate and apply the new transform
        const newTransform = calculateZoomTransform(mouseX, transform, newScale);
        svg.call(zoom.transform, newTransform);
    }
}, { passive: false, capture: true }); // Use capture phase to handle event first

timelineDiv.on('mousedown', function(event) {
    if (event.button === 0) { // Left mouse button only
        d3.select(this).style('cursor', 'grabbing');
        
        const startX = event.clientX;
        const startTransform = d3.zoomTransform(svg.node());
        
        // Handle mouse move
        const mousemove = (event) => {
            event.preventDefault();
            const dx = event.clientX - startX;
            let newTransform = startTransform.translate(dx / startTransform.k, 0);
            
            // Apply constraints
            newTransform = constrainTransform(newTransform);
            
            // Update the visualization with the new transform
            const newScale = newTransform.rescaleX(timeScale);
            updateAxis(newScale);
            updateVisualization(newTransform);
            if (mapData) {
                updateMapVisualization(newTransform);
            }
            
            // Apply the transform to the SVG
            svg.call(zoom.transform, newTransform);
        };
        
        // Handle mouse up
        const mouseup = (event) => {
            d3.select(this).style('cursor', 'grab');
            document.removeEventListener('mousemove', mousemove);
            document.removeEventListener('mouseup', mouseup);
        };
        
        // Add event listeners
        document.addEventListener('mousemove', mousemove);
        document.addEventListener('mouseup', mouseup);
    }
});

// Remove the wheel event handler from timelineDiv since we're handling it at SVG level
timelineDiv.on('wheel', null);

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

// Function to reset zoom to show full time range
function resetZoom() {
    // Reset to identity transform (no zoom, no translation)
    svg.transition()
        .duration(750) // Smooth transition over 750ms
        .call(zoom.transform, d3.zoomIdentity);
}

// Add reset zoom button functionality
d3.select('.zoom-reset')
    .on('click', resetZoom);

// Add cleanup on zoom start
zoom.on('start', () => {
    removeAllTooltips();
});

// Add global mouse move handler to clean up orphaned tooltips
document.addEventListener('mousemove', (event) => {
    // If we're not over an event dot or tooltip, remove all tooltips
    const elementUnderMouse = document.elementFromPoint(event.clientX, event.clientY);
    if (!elementUnderMouse?.classList.contains('event-dot') && 
        !elementUnderMouse?.closest('.tooltip')) {
        removeAllTooltips();
    }
});

// Clean up tooltips when leaving the timeline area
timelineDiv.on('mouseleave', removeAllTooltips);