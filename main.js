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

// Enable zoom and pan on the timeline div and disable text selection
const timelineDiv = d3.select('#timeline')
    .style('cursor', 'grab')
    .style('user-select', 'none')
    .style('-webkit-user-select', 'none')
    .style('-moz-user-select', 'none')
    .style('-ms-user-select', 'none');

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

// Debounce function to limit update frequency
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to update timeline visualization
function updateVisualization(transform) {
    // Ensure we have a valid transform object
    if (!transform) {
        transform = d3.zoomTransform(svg.node());
    }

    // Calculate the new scale and threshold
    const newScale = transform.rescaleX(timeScale);
    
    // Update the axis first for immediate feedback
    updateAxis(newScale);
    
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
    
    // Only proceed with update if we have events to show
    if (visibleEvents.length === 0) {
        return;
    }

    const clusters = clusterEvents(visibleEvents, newScale, threshold);
    calculateLabelPositions(clusters);

    // Remove existing elements and tooltips
    removeAllTooltips();
    
    // Use more efficient D3 update pattern
    const eventGroups = svg.selectAll(".event-group")
        .data(clusters, d => d.events[0].date.getTime());

    // Remove old elements
    eventGroups.exit().remove();

    // Add new elements
    const enterGroups = eventGroups.enter()
        .append("g")
        .attr("class", "event-group");

    // Add lines to enter selection
    enterGroups.append("line")
        .attr("class", "event-line")
        .attr("x1", 0)
        .attr("y1", height / 2)
        .attr("x2", 0)
        .attr("y2", d => height / 2 - lineLength - d.yOffset)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .style("visibility", "hidden")
        .style("pointer-events", "none");

    // Add dots to enter selection
    enterGroups.append("circle")
        .attr("class", "event-dot")
        .attr("cx", 0)
        .attr("cy", height / 2)
        .attr("r", d => Math.max(3, Math.min(8, Math.sqrt(d.events.length) * 3)))
        .attr("fill", d => d.events.length > 1 ? "red" : "blue")
        .style("pointer-events", "all")
        .style("cursor", d => d.events.length > 1 ? "pointer" : "default");

    // Add text to enter selection
    enterGroups.append("text")
        .attr("class", "event-text")
        .attr("x", 0)
        .attr("y", d => height / 2 - lineLength - textOffset - d.yOffset)
        .attr("text-anchor", "middle")
        .style("visibility", "hidden")
        .style("pointer-events", "none")
        .text(d => d.events.length > 1 ? `${d.events.length} events` : d.events[0].title);

    // Merge enter and update selections
    const allGroups = enterGroups.merge(eventGroups);

    // Update all groups with new positions
    allGroups.attr("transform", d => `translate(${newScale(d.events[0].date)},0)`);

    // Update event handlers
    allGroups.selectAll(".event-dot")
        .on("click", function(event, d) {
            if (d.events.length > 1) {
                event.stopPropagation();
                zoomToEvents(d.events);
            }
        })
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
            setTimeout(() => {
                if (!d3.select(document.elementFromPoint(event.clientX, event.clientY)).classed('event-dot')) {
                    removeAllTooltips();
                }
            }, 50);

            d3.select(this.parentNode).select(".event-line")
                .style("visibility", "hidden");
            d3.select(this.parentNode).select(".event-text")
                .style("visibility", "hidden");
        });
}

// Debounced version of updateVisualization for wheel events
const debouncedUpdateVisualization = debounce((transform) => {
    updateVisualization(transform);
}, 50);

// Handle wheel events at the SVG level with debouncing
svg.on('wheel', null); // Remove the old wheel handler

// Add wheel event handler to the timeline div
timelineDiv.on('wheel', function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    const transform = d3.zoomTransform(svg.node());
    const delta = event.deltaY;
    const scaleFactor = delta > 0 ? 0.9 : 1.1;
    const newScale = transform.k * scaleFactor;
    
    if (newScale >= 1 && newScale <= 1000000) {
        const svgRect = svg.node().getBoundingClientRect();
        const mouseX = event.clientX - svgRect.left;
        const newTransform = calculateZoomTransform(mouseX, transform, newScale);
        
        // Update transform and visualization immediately
        svg.call(zoom.transform, newTransform);
        updateVisualization(newTransform);
        if (mapData) {
            updateMapVisualization(newTransform);
        }
    }
}, { passive: false });

// Timeline zoom functionality
const zoom = d3.zoom()
    .scaleExtent([1, 1000000])
    .extent([[0, 0], [width, height]])
    .translateExtent([[0, -Infinity], [width, Infinity]])
    .on('zoom', event => {
        if (event.sourceEvent && event.sourceEvent.type === 'wheel') {
            // Let our custom wheel handler handle wheel-based zooming
            return;
        }
        const constrainedTransform = constrainTransform(event.transform);
        updateVisualization(constrainedTransform);
        if (mapData) {
            updateMapVisualization(constrainedTransform);
        }
    });

// Apply zoom to the SVG
svg.call(zoom);

// Remove the wheel event handler from timelineDiv since we're handling it separately
timelineDiv.on('wheel.zoom', null);

// Add mousedown handler for panning
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
            
            // Update transform and visualization immediately
            svg.call(zoom.transform, newTransform);
            updateVisualization(newTransform);
            if (mapData) {
                updateMapVisualization(newTransform);
            }
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

// Function to update map visualization
function updateMapVisualization(transform = null) {
    if (!mapData) return;
    
    if (!transform) {
        transform = d3.zoomTransform(svg.node());
    }

    const mapWidth = document.getElementById('world-map').clientWidth;
    const mapHeight = document.getElementById('world-map').clientHeight;
    const projection = d3.geoNaturalEarth1()
        .fitSize([mapWidth, mapHeight], mapData);

    const newScale = transform.rescaleX(timeScale);
    const visibleRange = [
        newScale.invert(0),
        newScale.invert(width)
    ];

    const visibleEvents = events.filter(event => 
        event.date >= visibleRange[0] && event.date <= visibleRange[1]
    );

    const threshold = Math.max(20, 50 / transform.k);
    const clusters = clusterEvents(visibleEvents, newScale, threshold, projection);

    // Use more efficient D3 update pattern for map dots
    const dots = mapG.selectAll(".map-event-dot")
        .data(clusters, d => `${d.lat}-${d.lng}-${d.events[0].date.getTime()}`);

    // Remove old dots
    dots.exit().remove();

    // Add new dots
    const enterDots = dots.enter()
        .append("circle")
        .attr("class", "map-event-dot")
        .attr("opacity", 0.7)
        .style("cursor", d => d.events.length > 1 ? "pointer" : "default");

    // Update all dots
    const allDots = enterDots.merge(dots)
        .attr("cx", d => projection([d.lng, d.lat])[0])
        .attr("cy", d => projection([d.lng, d.lat])[1])
        .attr("r", d => Math.max(3, Math.min(8, Math.sqrt(d.events.length) * 3)))
        .attr("fill", d => d.events.length > 1 ? "red" : "blue");

    // Update event handlers
    allDots
        .on("click", function(event, d) {
            if (d.events.length > 1) {
                event.stopPropagation();
                zoomToEvents(d.events);
            }
        })
        .on("mouseover", function(event, d) {
            svg.selectAll(".event-dot")
                .filter(e => e.events.some(ev => d.events.includes(ev)))
                .attr("stroke", "#333")
                .attr("stroke-width", 2);

            createTooltip(event, {
                events: d.events,
                count: d.events.length
            });
        })
        .on("mouseout", function() {
            svg.selectAll(".event-dot")
                .attr("stroke", null)
                .attr("stroke-width", null);
            removeAllTooltips();
        });
}

// Debounced version of updateMapVisualization
const debouncedUpdateMapVisualization = debounce((transform) => {
    updateMapVisualization(transform);
}, 50);

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
    const newTransform = d3.zoomIdentity;
    svg.transition()
        .duration(750)
        .call(zoom.transform, newTransform)
        .on("end", () => {
            updateVisualization(newTransform);
            if (mapData) {
                updateMapVisualization(newTransform);
            }
        });
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

// Function to zoom to specific events
function zoomToEvents(events) {
    if (!events || events.length === 0) return;

    // Find the date range of the events
    const dates = events.map(e => e.date);
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    // Calculate the center date of the events
    const centerDate = new Date((minDate.getTime() + maxDate.getTime()) / 2);
    
    // Calculate the time range with padding
    const timeRange = maxDate - minDate;
    const padding = Math.max(timeRange * 0.2, 1000 * 60 * 60 * 24 * 30); // At least 30 days padding
    const paddedMinDate = new Date(minDate.getTime() - padding);
    const paddedMaxDate = new Date(maxDate.getTime() + padding);
    
    // Calculate the scale needed to fit this range
    const targetScale = width / (timeScale(paddedMaxDate) - timeScale(paddedMinDate));
    
    // Calculate the translation needed to center the events
    const targetX = width / 2 - timeScale(centerDate) * targetScale;
    
    // Create the new transform
    const newTransform = d3.zoomIdentity
        .translate(targetX, 0)
        .scale(targetScale);
    
    // Apply constraints to the transform
    const constrainedTransform = constrainTransform(newTransform);
    
    // Animate the transition and update visualization
    svg.transition()
        .duration(750)
        .call(zoom.transform, constrainedTransform)
        .on("end", () => {
            updateVisualization(constrainedTransform);
            if (mapData) {
                updateMapVisualization(constrainedTransform);
            }
        });
}

// Add click handler to reset zoom when clicking on empty space
svg.on("click", function(event) {
    // Only reset if clicking on the background
    if (event.target === this) {
        resetZoom();
    }
});

mapSvg.on("click", function(event) {
    // Only reset if clicking on the background
    if (event.target === this) {
        resetZoom();
    }
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

// Initialize the date picker with the current date and time
const datePicker = document.getElementById('date-picker');
const currentDate = new Date();
datePicker.value = currentDate.toISOString().slice(0, 16); // Format: YYYY-MM-DDThh:mm

// Function to go to selected date
function goToSelectedDate() {
    const selectedDate = new Date(datePicker.value);
    
    // Calculate dates for 6 months before and after the selected date
    const startDate = new Date(selectedDate);
    startDate.setMonth(startDate.getMonth() - 6);
    
    const endDate = new Date(selectedDate);
    endDate.setMonth(endDate.getMonth() + 6);
    
    // Calculate the scale needed to fit this range
    const targetScale = width / (timeScale(endDate) - timeScale(startDate));
    
    // Calculate the translation needed to center on the selected date
    const targetX = width / 2 - timeScale(selectedDate) * targetScale;
    
    // Create new transform with the calculated scale and translation
    const newTransform = d3.zoomIdentity
        .translate(targetX, 0)
        .scale(targetScale);
    
    // Apply constraints and transition
    const constrainedTransform = constrainTransform(newTransform);
    
    // Apply the transform with transition
    svg.transition()
        .duration(750)
        .call(zoom.transform, constrainedTransform)
        .on("end", () => {
            updateVisualization(constrainedTransform);
            if (mapData) {
                updateMapVisualization(constrainedTransform);
            }
        });
}

// Add event listener to the Go to Date button
document.querySelector('.go-to-date').addEventListener('click', goToSelectedDate);