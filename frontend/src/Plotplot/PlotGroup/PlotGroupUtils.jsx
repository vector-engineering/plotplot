import { nFormatter } from '../../utility';

const convert = require('color-convert')

export function getSubsetIds(subsetsSelected) {
    if (!subsetsSelected) {
        return [0] // default to the (all) subset, which always has ID 0.
    } else if (!Array.isArray(subsetsSelected)) {
        // Only one subset
        return [subsetsSelected.value]
    } else {
        // Array of subsets
        let ids = []
        for (let subset of subsetsSelected) {
            if (!subset) {
                ids.push(0)
                break
            }
            ids.push(subset.value)
        }
        return ids
    }
}

export function getXAxis(layout) {
    if (nanPlotsShown(layout)) {
        return layout.xaxis3
    } else {
        return layout.xaxis
    }
}

export function getYAxis(layout) {
    if (nanPlotsShown(layout)) {
        return layout.yaxis3
    } else {
        return layout.yaxis
    }
}

export function getSubsetIdsInGraphOrder(subsetsSelected, subsetOrder) {
    const subset_ids = getSubsetIds(subsetsSelected)

    if (subsetOrder) {
        // subsetOrder is valid, use it.
        // Sort data array based on subsetOrder
        const sortedData = subset_ids.sort((a, b) => {
            const indexA = subsetOrder.indexOf(a);
            const indexB = subsetOrder.indexOf(b);

            // If a.id isn't in subsetOrder, place it at the end
            if (indexA === -1) return 1;
            // If b.id isn't in subsetOrder, place it at the beginning
            if (indexB === -1) return -1;

            // Regular comparison based on subsetOrder
            return indexA - indexB;
        });
        return sortedData
    }
    return subset_ids
}

export function subsetSelectedEntryFromSubset(all_subsets, sub) {
    const name = all_subsets[sub['id']]['name']
    return { value: sub['id'], label: formatSubsetStr(name, sub['count']) }
}

export function numericArraysEqual(array1, array2) {
    const array2Sorted = array2.slice().sort();
    return array1.length === array2.length && array1.slice().sort().every(function (value, index) {
        return value === array2Sorted[index];
    });
}

// export function getMarkerColor(graph_json, subsets_selected, subset_id) {
//     // Read out the color from the graph json for the subset of interest.
//     let counter = 0
//     for (let id of getSubsetIds(subsets_selected)) {
//         if (id == subset_id) {
//             return graph_json.data[counter].marker.color
//         }
//         counter ++;
//     }
// }

export function getMarkerColor(subsets, id) {
    if (subsets && id in subsets && 'color' in subsets[id]) {
        return subsets[id]['color']
    } else {
        return '#000000'
    }
}

export function getDefaultMarkerColor(i) {
    const ALL_COLORS = [
        '#4287f580',     // default blue  'rgba(66, 135, 245, 0.5)',
        '#ff7f0e80',  // safety orange
        '#2ca02c80',  // cooked asparagus green
        '#d6272880',  // brick red
        '#9467bd80',  // muted purple
        '#8c564b80',  // chestnut brown
        '#e377c280',  // raspberry yogurt pink
        '#bcbd2280',  // curry yellow-green
        '#17becf80',   // blue-teal
        //'#7f7f7f80',  // middle gray
    ]
    return ALL_COLORS[i % ALL_COLORS.length]
}

export function getSubsetColors(subset_ids, subsets) {
    let colors = []
    for (let id of subset_ids) {
        colors.push(subsets[id]['color'])
    }
    return colors
}

// ['Blues',
//     'Oranges',
//     'Greens',
//     'Reds',
//     'Purples',
//     'Greys',
//     'Brwnyl',]


export function sortSelectedOptions(selected_in, subsetOrder) {
    // Check if subsetOrder has been set
    if (subsetOrder) {
        // subsetOrder is valid, use it.
        // Sort data array based on subsetOrder
        const sortedData = selected_in.sort((a, b) => {
            const indexA = subsetOrder.indexOf(a.value);
            const indexB = subsetOrder.indexOf(b.value);

            // If a.id isn't in subsetOrder, place it at the end
            if (indexA === -1) return 1;
            // If b.id isn't in subsetOrder, place it at the beginning
            if (indexB === -1) return -1;

            // Regular comparison based on subsetOrder
            return indexA - indexB;
        });
        return sortedData
    } else {
        // subsetOrder isn't valid, just use ID-based ordering
        if (Array.isArray(selected_in)) {
            selected_in = selected_in.sort((a, b) => {
                return a.value - b.value
            })
        }
        return selected_in
    }
}


export function formatSubsetStr(name, count) {
    return name + ' - ' + nFormatter(count)
}

export function nanPlotsShown(layout) {
    if (layout.hasOwnProperty('xaxis3')) {
        return true
    } else {
        return false
    }
}

export function generateNullPlot(x, y, subsets, plotType) {
    let empty_trace = {
        x: [],
        y: [],
        type: 'scatter',
    }
    let xtitle = x;
    let ytitle = y;
    let data = [empty_trace]
    if (x == null) {
        if (plotType == 'rank') {
            xtitle = 'Rank'
        } else {
            xtitle = '<b>Drop a variable</b>'
        }
    }
    if (y == null) {
        if (plotType == 'histogram') {
            ytitle = 'Count'
        } else {
            ytitle = '<b>Drop a variable</b>'
        }
    }
    let layout = {
        template: getLayoutForPlotlyWhiteTemplate(),
        coloraxis: {
            showscale: false,
        },
        font: {
            size: 16,
        },
        xaxis: {
            range: [-1, 5],
            title: { text: xtitle },
        },
        yaxis: {
            range: [-1, 5],
            title: { text: ytitle },
        },
    }
    if (!subsets || subsets.length == 0) {
        layout.annotations = [{
            xref: 'paper',
            yref: 'paper',
            x: 0.01,
            xanchor: 'left',
            y: 1.0,
            yanchor: 'top',
            text: '       ⬆<br>       select a subset ',
            align: 'left',
            showarrow: false,
            font: {
                color: "black",
                size: 30,
            },
            bgcolor: "white",
        },
        ]
    }
    let graph = {
        data: data,
        layout: layout
    }
    return graph
}

export function getDefaultMarkerSize() {
    return 3
}

export function getDensityColorScale(color) {
    // Color scale keeps the Hue the same and varies the saturation and value.
    //const convert = require('color-convert')
    let hsv = convert.hex.hsv(color)
    let rgb = convert.hsv.rgb(hsv[0], 100, hsv[2]) // HSV range is not uniform: H: 0-360, S&V: 0-100
    let max_color = 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 80)'

    // Move towards white
    let rgb2 = convert.hsv.rgb(hsv[0], 20, 100)
    let zero_color = 'rgba(' + rgb2[0] + ', ' + rgb2[1] + ', ' + rgb2[2] + ', 80)'

    let colorscale = [[0, zero_color], [1, max_color]]
    return colorscale
}

export function getPlotMarker(initMarker, zAxis, subsets, subset_id, colorscaleFlipped, colorscale, minmaxRanges, isSelectingData, colorSliderValues) {
    let marker_out = { ...initMarker, size: subsets[subset_id]['size'] }

    if (!zAxis || zAxis == '') {
        marker_out = { ...marker_out, color: getMarkerColor(subsets, subset_id) }
    } else {
        if (colorscale) {
            marker_out.colorscale = getColorscale(colorscale)
        } else {
            marker_out.colorscale = getDensityColorScale(getMarkerColor(subsets, subset_id))
        }

        if (isSelectingData) {
            marker_out.colorscale = getColorScaleForSelection(marker_out.colorscale, colorSliderValues, minmaxRanges['cmin'], minmaxRanges['cmax'], colorscaleFlipped)
        }

        marker_out.reversescale = colorscaleFlipped

        // This is important to set the colorrange for markers.
        marker_out.cmin = minmaxRanges['cmin']
        marker_out.cmax = minmaxRanges['cmax']
    }
    return marker_out
}

export function shouldShowColorbar(graphJson, zAxis) {
    let showColorbar = false
    if (zAxis && zAxis != '') {
        return true
    }
    if (graphJson && 'data' in graphJson) {
        for (let i in graphJson.data) {
            if ('type' in graphJson.data[i] && graphJson.data[i].type == "heatmap") {
                showColorbar = true
                break
            }
        }
    }
    return showColorbar
}

function parseColor(input) {
    // Handle array format
    if (Array.isArray(input)) {
        if (input.length === 3 && input.every(num => typeof num === 'number' && num >= 0 && num <= 255)) {
            return input;
        } else {
            throw new Error('Invalid RGB array format' + input);
        }
    }

    // Handle rgb() and rgba() formats
    if (input.startsWith('rgb')) {
        return input.match(/\d+/g).slice(0, 3).map(Number);
    }

    // Handle hex format
    if (input.startsWith('#')) {
        if (input.length === 4) { // short form like #RGB
            return [
                parseInt(input[1] + input[1], 16),
                parseInt(input[2] + input[2], 16),
                parseInt(input[3] + input[3], 16),
            ];
        } else { // long form like #RRGGBB
            return [
                parseInt(input.slice(1, 3), 16),
                parseInt(input.slice(3, 5), 16),
                parseInt(input.slice(5, 7), 16),
            ];
        }
    }

    throw new Error('Unsupported color format');
}

function interpolateColor(color1, color2, factor) {
    const [r1, g1, b1] = parseColor(color1)
    const [r2, g2, b2] = parseColor(color2)
    const r = r1 + factor * (r2 - r1);
    const g = g1 + factor * (g2 - g1);
    const b = b1 + factor * (b2 - b1);
    return [Math.round(r), Math.round(g), Math.round(b)];
}

function getColorAtValue(colorscale, value) {
    for (let val of colorscale) {
        if (value == val[0]) {
            return parseColor(val[1])
        }
    }
    for (let i = 0; i < colorscale.length - 1; i++) {
        const [value1, color1] = colorscale[i];
        const [value2, color2] = colorscale[i + 1];
        if (value >= value1 && value <= value2) {
            const factor = (value - value1) / (value2 - value1);
            return interpolateColor(color1, color2, factor);
        }
    }
    if (value <= colorscale[0][0]) {
        return parseColor(colorscale[0][1])
    } else if (value >= colorscale[colorscale.length -1][0]) {
        return parseColor(colorscale[colorscale.length -1][1])
    }
    return [0, 0, 0]
}

function insertColorIntoColorscale(colorscale, value, color) {
    colorscale.push([value, color]);

    // Sort the colorscale array by value
    colorscale.sort((a, b) => a[0] - b[0]);
    return colorscale
}

function fadeHSVtoRGB(hsv) {
    let rgb2 = convert.hsv.rgb(hsv[0], 15, hsv[2]) // HSV range is not uniform: H: 0-360, S&V: 0-100
    return rgb2
}

function addStopForColorscale(original_colorscale, new_colorscale, stop_value, fade_below) {
    // Now add stops in the colorscale right next to the cutoff.
    let other_stop = Math.max(0, stop_value*0.9999)//.0001)
    if (!fade_below) {
        other_stop = Math.min(1, stop_value*1.0001)
    }
    let color_at_value1 = getColorAtValue(original_colorscale, other_stop)
    // // Move towards white
    let hsv = convert.rgb.hsv(parseColor(color_at_value1))
    let rgb2 = fadeHSVtoRGB(hsv)
    color_at_value1 = 'rgb(' + rgb2[0] + ', ' + rgb2[1] + ', ' + rgb2[2] + ')'

    // Add a stop with the original colorscale to make it bright again.
    let color_at_value2 = getColorAtValue(original_colorscale, stop_value)
    color_at_value2 = 'rgb(' + color_at_value2[0] + ', ' + color_at_value2[1] + ', ' + color_at_value2[2] + ')'
    new_colorscale = insertColorIntoColorscale(new_colorscale, other_stop, color_at_value1)
    new_colorscale = insertColorIntoColorscale(new_colorscale, stop_value, color_at_value2)

    return new_colorscale
}

function getColorScaleForSelection(original_colorscale, colorSliderValues, cmin, cmax, colorscaleFlipped) {
    if (cmax - cmin <= 0 || !original_colorscale || original_colorscale.length < 2) {
        return original_colorscale
    }
    
    // insert coloring into the colorscale to gray-out everything that won't be selected.
    let minval = Math.min(colorSliderValues[0], colorSliderValues[1])
    let maxval = Math.max(colorSliderValues[0], colorSliderValues[1])

    // Map that those to 0-1
    let minp = Math.max(0, (minval - cmin) / (cmax - cmin))
    let maxp = Math.min(1, (maxval - cmin) / (cmax - cmin))

    if (colorscaleFlipped) {
        let minp_temp = minp
        minp = 1 - maxp
        maxp = 1 - minp_temp
    }

    // What we need to do is change all of the values not in the range to be faded.
    // We can do this by looping through the values and fading them out.
    let new_colorscale = []
    for (let i = 0; i < original_colorscale.length; i++) {
        let colorpair = original_colorscale[i]
        // Prevent duplicate percentage values.
        if (colorpair[0] == minp || colorpair[0] == maxp) {
            // We want to prevent adding everything but the min/max values.  We prevent duplicates in that case by
            // avoiding adding a stop at the min/max values.
            if (i != 0 && i != original_colorscale.length - 1) {
                // We are at an existing stop exactly (but not the min/max)
                continue
            }
        }

        if (colorpair[0] < minp || colorpair[0] > maxp) {
            // This is outside the range and should be faded
            let color = colorpair[1]

            // Convert to rgb if needed
            color = parseColor(color)

            // Fade it out
            let hsv = convert.rgb.hsv(color)
            let rgb2 = fadeHSVtoRGB(hsv)
            color = 'rgb(' + rgb2[0] + ', ' + rgb2[1] + ', ' + rgb2[2] + ')'

            new_colorscale.push([colorpair[0], color])
        } else {
            // Don't modify it 
            new_colorscale.push(colorpair)
        }
    }

    if (minp != original_colorscale[0][0]) {
        new_colorscale = addStopForColorscale(original_colorscale, new_colorscale, minp, true)
    }
    if (maxp != original_colorscale[original_colorscale.length-1][0]) {
        new_colorscale = addStopForColorscale(original_colorscale, new_colorscale, maxp, false)
    }

    return new_colorscale
}

export function doPlotColoring(graphJson, subsets, zAxis, subset_ids_in_graph_order, colorscaleFlipped, colorscale, minmaxRanges, isSelectingData, colorSliderValues) {
    let num_bars = 0
    let last_bar_idx = null

    const nanShown = nanPlotsShown(graphJson.layout)

    // Figure out the last data column that is on the main axis
    let lastDataIdx = 0
    for (let i in graphJson.data) {
        if (!nanShown || graphJson.data[i].xaxis == 'x3') {
            if (graphJson.data[i].type == 'heatmap' || (zAxis && zAxis != '')) {
                lastDataIdx = i
            }
        }
    }

    const thickness = Math.max(1, Math.min(7, -0.3 * lastDataIdx + 7))

    for (let i in graphJson.data) {
        if (!nanShown || graphJson.data[i].xaxis == 'x3') { // don't mess with NaN colors

            // check for a histogram
            if (graphJson.data[i].type === "bar") {
                graphJson.data[i].marker = {color: getMarkerColor(subsets, subset_ids_in_graph_order[i])}
                continue
            }

            if (colorscale) {
                graphJson.data[i].colorscale = getColorscale(colorscale)
            } else {
                graphJson.data[i].colorscale = getDensityColorScale(getMarkerColor(subsets, subset_ids_in_graph_order[i]))
            }

            let data_ok = false
            if (minmaxRanges && 'cmin' in minmaxRanges && 'cmax' in minmaxRanges) {
                data_ok = true
                graphJson.data[i].zmin = minmaxRanges['cmin']
                graphJson.data[i].zmax = minmaxRanges['cmax']
                graphJson.data[i].reversescale = colorscaleFlipped
                graphJson.data[i].marker = getPlotMarker(graphJson.data[i].marker, zAxis, subsets, subset_ids_in_graph_order[i], colorscaleFlipped, colorscale, minmaxRanges, isSelectingData, colorSliderValues)
            }

            if (data_ok && shouldShowColorbar(graphJson, zAxis)) {

                if (isSelectingData && colorSliderValues) {
                    graphJson.data[i].colorscale = getColorScaleForSelection(graphJson.data[i].colorscale, colorSliderValues, minmaxRanges['cmin'], minmaxRanges['cmax'], colorscaleFlipped)
                }

                let colorbar_out = {
                    x: 1,
                    xpad: thickness * num_bars,
                    y: 1,
                    yref: 'paper',
                    yanchor: 'top',
                    ypad: 60,
                    thickness: thickness,
                    orientation: 'v',
                    // showticklabels <-- NEVER set this value, you'll crash in prod (but not in dev)
                }
                
                let show_ticklabels = i == lastDataIdx
                
                if (graphJson.data[i].type === "heatmap" || (zAxis && zAxis != '')) {
                    // Plotly seems to have a bug where if you mix colorbars for heatmaps and non-heatmaps and you set "showticklabels" on a heatmap colorbar, you'll get a JS crash.  I'm working aroud this bug by never setting that value and instead setting the "tickmode" to be "array" and "ticktext" to be an empty array when in heatmap mode.
                    //
                    // NOTE: this crash only appears in the production mode, it works in development mode fine.
                    if (!show_ticklabels) {
                        colorbar_out['tickmode'] = 'array'
                        colorbar_out['tickvals'] = []
                        colorbar_out['ticktext'] = []
                    }

                    if (graphJson.data[i].type === "heatmap") {
                        graphJson.data[i].colorbar = colorbar_out
                        graphJson.data[i].showscale = true
                    } else {
                        graphJson.data[i].marker.colorbar = colorbar_out
                        graphJson.data[i].marker.showscale = true
                    }
                    num_bars++;
                    last_bar_idx = i
                // } else if (zAxis && zAxis != '') {
                //     colorbar_out['showticklabels'] = show_ticklabels // Don't ever set this on a heatmap plot, see comment above about the Plotly crash.

                //     // There is a value on the z-axis, so show the colorbar for all plots
                //     graphJson.data[i].marker.colorbar = colorbar_out
                //     graphJson.data[i].marker.showscale = true
                //     num_bars ++;
                //     last_bar_idx = i
                } else {
                    // No value on the z-axis and this isn't a heatmap, so don't show the colorbar for it.
                    graphJson.data[i].marker.showscale = false
                }
            } else {
                graphJson.data[i].showscale = false
            }
        }
    }
    if (last_bar_idx) {
        if ('showscale' in graphJson.data[last_bar_idx] && graphJson.data[last_bar_idx].showscale) {
            graphJson.data[last_bar_idx].colorbar['showticklabels'] = true
        } else {
            graphJson.data[last_bar_idx].marker.colorbar['showticklabels'] = true
        }
    }

    return graphJson
}

export function truncateMiddle(str, maxLength = 35) {
    if (str.length <= maxLength) {
        return str;
    }

    const charsToShow = maxLength - 3;
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);

    return str.substr(0, frontChars) + '...' + str.substr(str.length - backChars);
}

export function getPlotWidthHeightPxUtil(plotId, nanShown) {
    // Try to get the width of the plot from the browser.
    // document.querySelector("#plotDivIdln52ewa74v0c65054bm > div > div > svg:nth-child(1) > g.draglayer.cursor-move > g > rect.nsewdrag.drag")
    // document.querySelector("#plotDivIdln52ewa74v0c65054bm > div > div > svg:nth-child(1) > g.draglayer.cursor-move > g.x3y3 > rect.nsewdrag.drag")

    let selector_nan = ''
    if (nanShown) {
        selector_nan = 'g.x3y3 > '
    }

    const plot_area_element = document.querySelector('#' + plotId + " " + selector_nan + "rect.nsewdrag.drag");

    if (plot_area_element) {
        return [plot_area_element.getAttribute('width'), plot_area_element.getAttribute('height')]
    } else {
        return [0, 0]
    }
}

export function getLayoutForPlotlyWhiteTemplate() {
    return { "data": { "barpolar": [{ "marker": { "line": { "color": "white", "width": 0.5 }, "pattern": { "fillmode": "overlay", "size": 10, "solidity": 0.2 } }, "type": "barpolar" }], "bar": [{ "error_x": { "color": "#2a3f5f" }, "error_y": { "color": "#2a3f5f" }, "marker": { "line": { "color": "white", "width": 0.5 }, "pattern": { "fillmode": "overlay", "size": 10, "solidity": 0.2 } }, "type": "bar" }], "carpet": [{ "aaxis": { "endlinecolor": "#2a3f5f", "gridcolor": "#C8D4E3", "linecolor": "#C8D4E3", "minorgridcolor": "#C8D4E3", "startlinecolor": "#2a3f5f" }, "baxis": { "endlinecolor": "#2a3f5f", "gridcolor": "#C8D4E3", "linecolor": "#C8D4E3", "minorgridcolor": "#C8D4E3", "startlinecolor": "#2a3f5f" }, "type": "carpet" }], "choropleth": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "type": "choropleth" }], "contourcarpet": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "type": "contourcarpet" }], "contour": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "contour" }], "heatmapgl": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "heatmapgl" }], "heatmap": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "heatmap" }], "histogram2dcontour": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "histogram2dcontour" }], "histogram2d": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "histogram2d" }], "histogram": [{ "marker": { "pattern": { "fillmode": "overlay", "size": 10, "solidity": 0.2 } }, "type": "histogram" }], "mesh3d": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "type": "mesh3d" }], "parcoords": [{ "line": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "parcoords" }], "pie": [{ "automargin": true, "type": "pie" }], "scatter3d": [{ "line": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scatter3d" }], "scattercarpet": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scattercarpet" }], "scattergeo": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scattergeo" }], "scattergl": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scattergl" }], "scattermapbox": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scattermapbox" }], "scatterpolargl": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scatterpolargl" }], "scatterpolar": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scatterpolar" }], "scatter": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scatter" }], "scatterternary": [{ "marker": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "type": "scatterternary" }], "surface": [{ "colorbar": { "outlinewidth": 0, "ticks": "" }, "colorscale": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "type": "surface" }], "table": [{ "cells": { "fill": { "color": "#EBF0F8" }, "line": { "color": "white" } }, "header": { "fill": { "color": "#C8D4E3" }, "line": { "color": "white" } }, "type": "table" }] }, "layout": { "annotationdefaults": { "arrowcolor": "#2a3f5f", "arrowhead": 0, "arrowwidth": 1 }, "autotypenumbers": "strict", "coloraxis": { "colorbar": { "outlinewidth": 0, "ticks": "" } }, "colorscale": { "diverging": [[0, "#8e0152"], [0.1, "#c51b7d"], [0.2, "#de77ae"], [0.3, "#f1b6da"], [0.4, "#fde0ef"], [0.5, "#f7f7f7"], [0.6, "#e6f5d0"], [0.7, "#b8e186"], [0.8, "#7fbc41"], [0.9, "#4d9221"], [1, "#276419"]], "sequential": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]], "sequentialminus": [[0.0, "#0d0887"], [0.1111111111111111, "#46039f"], [0.2222222222222222, "#7201a8"], [0.3333333333333333, "#9c179e"], [0.4444444444444444, "#bd3786"], [0.5555555555555556, "#d8576b"], [0.6666666666666666, "#ed7953"], [0.7777777777777778, "#fb9f3a"], [0.8888888888888888, "#fdca26"], [1.0, "#f0f921"]] }, "colorway": ["#636efa", "#EF553B", "#00cc96", "#ab63fa", "#FFA15A", "#19d3f3", "#FF6692", "#B6E880", "#FF97FF", "#FECB52"], "font": { "color": "#2a3f5f" }, "geo": { "bgcolor": "white", "lakecolor": "white", "landcolor": "white", "showlakes": true, "showland": true, "subunitcolor": "#C8D4E3" }, "hoverlabel": { "align": "left" }, "hovermode": "closest", "mapbox": { "style": "light" }, "paper_bgcolor": "white", "plot_bgcolor": "white", "polar": { "angularaxis": { "gridcolor": "#EBF0F8", "linecolor": "#EBF0F8", "ticks": "" }, "bgcolor": "white", "radialaxis": { "gridcolor": "#EBF0F8", "linecolor": "#EBF0F8", "ticks": "" } }, "scene": { "xaxis": { "backgroundcolor": "white", "gridcolor": "#DFE8F3", "gridwidth": 2, "linecolor": "#EBF0F8", "showbackground": true, "ticks": "", "zerolinecolor": "#d7dce4" }, "yaxis": { "backgroundcolor": "white", "gridcolor": "#DFE8F3", "gridwidth": 2, "linecolor": "#EBF0F8", "showbackground": true, "ticks": "", "zerolinecolor": "#d7dce4" }, "zaxis": { "backgroundcolor": "white", "gridcolor": "#DFE8F3", "gridwidth": 2, "linecolor": "#EBF0F8", "showbackground": true, "ticks": "", "zerolinecolor": "#d7dce4" } }, "shapedefaults": { "line": { "color": "#2a3f5f" } }, "ternary": { "aaxis": { "gridcolor": "#DFE8F3", "linecolor": "#A2B1C6", "ticks": "" }, "baxis": { "gridcolor": "#DFE8F3", "linecolor": "#A2B1C6", "ticks": "" }, "bgcolor": "white", "caxis": { "gridcolor": "#DFE8F3", "linecolor": "#A2B1C6", "ticks": "" } }, "title": { "x": 0.05 }, "xaxis": { "automargin": true, "gridcolor": "#EBF0F8", "linecolor": "#EBF0F8", "ticks": "", "title": { "standoff": 15 }, "zerolinecolor": "#d7dce4", "zerolinewidth": 2 }, "yaxis": { "automargin": true, "gridcolor": "#EBF0F8", "linecolor": "#EBF0F8", "ticks": "", "title": { "standoff": 15 }, "zerolinecolor": "#d7dce4", "zerolinewidth": 2 } } }
}

export function getColorscale(colorscale) {
    // Plasma and Inferno are different colorscales (continuous), so we'll pack everything together here.  Otherwise you have problems getting Inferno/Plasma for heatmaps.
    const scales = {
        'Greys': [[0, 'rgb(0,0,0)'], [1, 'rgb(255,255,255)'],],
        'YlGnBu': [[0, 'rgb(8,29,88)'], [0.125, 'rgb(37,52,148)'], [0.25, 'rgb(34,94,168)'], [0.375, 'rgb(29,145,192)'], [0.5, 'rgb(65,182,196)'], [0.625, 'rgb(127,205,187)'], [0.75, 'rgb(199,233,180)'], [0.875, 'rgb(237,248,217)'], [1, 'rgb(255,255,217)'],],
        'Greens': [[0, 'rgb(0,68,27)'], [0.125, 'rgb(0,109,44)'], [0.25, 'rgb(35,139,69)'], [0.375, 'rgb(65,171,93)'], [0.5, 'rgb(116,196,118)'], [0.625, 'rgb(161,217,155)'], [0.75, 'rgb(199,233,192)'], [0.875, 'rgb(229,245,224)'], [1, 'rgb(247,252,245)'],],
        'YlOrRd': [[0, 'rgb(128,0,38)'], [0.125, 'rgb(189,0,38)'], [0.25, 'rgb(227,26,28)'], [0.375, 'rgb(252,78,42)'], [0.5, 'rgb(253,141,60)'], [0.625, 'rgb(254,178,76)'], [0.75, 'rgb(254,217,118)'], [0.875, 'rgb(255,237,160)'], [1, 'rgb(255,255,204)'],],
        'Bluered': [[0, 'rgb(0,0,255)'], [1, 'rgb(255,0,0)'],],
        'RdBu': [[0, 'rgb(5,10,172)'], [0.35, 'rgb(106,137,247)'], [0.5, 'rgb(190,190,190)'], [0.6, 'rgb(220,170,132)'], [0.7, 'rgb(230,145,90)'], [1, 'rgb(178,10,28)'],],
        'Reds': [[0, 'rgb(220,220,220)'], [0.2, 'rgb(245,195,157)'], [0.4, 'rgb(245,160,105)'], [1, 'rgb(178,10,28)'],],
        'Blues': [[0, 'rgb(5,10,172)'], [0.35, 'rgb(40,60,190)'], [0.5, 'rgb(70,100,245)'], [0.6, 'rgb(90,120,245)'], [0.7, 'rgb(106,137,247)'], [1, 'rgb(220,220,220)'],],
        'Picnic': [[0, 'rgb(0,0,255)'], [0.1, 'rgb(51,153,255)'], [0.2, 'rgb(102,204,255)'], [0.3, 'rgb(153,204,255)'], [0.4, 'rgb(204,204,255)'], [0.5, 'rgb(255,255,255)'], [0.6, 'rgb(255,204,255)'], [0.7, 'rgb(255,153,255)'], [0.8, 'rgb(255,102,204)'], [0.9, 'rgb(255,102,102)'], [1, 'rgb(255,0,0)'],],
        'Rainbow': [[0, 'rgb(150,0,90)'], [0.125, 'rgb(0,0,200)'], [0.25, 'rgb(0,25,255)'], [0.375, 'rgb(0,152,255)'], [0.5, 'rgb(44,255,150)'], [0.625, 'rgb(151,255,0)'], [0.75, 'rgb(255,234,0)'], [0.875, 'rgb(255,111,0)'], [1, 'rgb(255,0,0)'],],
        'Portland': [[0, 'rgb(12,51,131)'], [0.25, 'rgb(10,136,186)'], [0.5, 'rgb(242,211,56)'], [0.75, 'rgb(242,143,56)'], [1, 'rgb(217,30,30)'],],
        'Jet': [[0, 'rgb(0,0,131)'], [0.125, 'rgb(0,60,170)'], [0.375, 'rgb(5,255,255)'], [0.625, 'rgb(255,255,0)'], [0.875, 'rgb(250,0,0)'], [1, 'rgb(128,0,0)'],],
        'Hot': [[0, 'rgb(0,0,0)'], [0.3, 'rgb(230,0,0)'], [0.6, 'rgb(255,210,0)'], [1, 'rgb(255,255,255)'],],
        'Blackbody': [[0, 'rgb(0,0,0)'], [0.2, 'rgb(230,0,0)'], [0.4, 'rgb(230,210,0)'], [0.7, 'rgb(255,255,255)'], [1, 'rgb(160,200,255)'],],
        'Earth': [[0, 'rgb(0,0,130)'], [0.1, 'rgb(0,180,180)'], [0.2, 'rgb(40,210,40)'], [0.4, 'rgb(230,230,50)'], [0.6, 'rgb(120,70,20)'], [1, 'rgb(255,255,255)'],],
        'Electric': [[0, 'rgb(0,0,0)'], [0.15, 'rgb(30,0,100)'], [0.4, 'rgb(120,0,100)'], [0.6, 'rgb(160,90,0)'], [0.8, 'rgb(230,200,0)'], [1, 'rgb(255,250,220)'],],
        'Viridis': [[0, '#440154'], [0.06274509803921569, '#48186a'], [0.12549019607843137, '#472d7b'], [0.18823529411764706, '#424086'], [0.25098039215686274, '#3b528b'], [0.3137254901960784, '#33638d'], [0.3764705882352941, '#2c728e'], [0.4392156862745098, '#26828e'], [0.5019607843137255, '#21918c'], [0.5647058823529412, '#1fa088'], [0.6274509803921569, '#28ae80'], [0.6901960784313725, '#3fbc73'], [0.7529411764705882, '#5ec962'], [0.8156862745098039, '#84d44b'], [0.8784313725490196, '#addc30'], [0.9411764705882353, '#d8e219'], [1, '#fde725'],],
        'Cividis': [[0.0, 'rgb(0,32,76)'], [0.058824, 'rgb(0,42,102)'], [0.117647, 'rgb(0,52,110)'], [0.176471, 'rgb(39,63,108)'], [0.235294, 'rgb(60,74,107)'], [0.294118, 'rgb(76,85,107)'], [0.352941, 'rgb(91,95,109)'], [0.411765, 'rgb(104,106,112)'], [0.470588, 'rgb(117,117,117)'], [0.529412, 'rgb(131,129,120)'], [0.588235, 'rgb(146,140,120)'], [0.647059, 'rgb(161,152,118)'], [0.705882, 'rgb(176,165,114)'], [0.764706, 'rgb(192,177,109)'], [0.823529, 'rgb(209,191,102)'], [0.882353, 'rgb(225,204,92)'], [0.941176, 'rgb(243,219,79)'], [1.0, 'rgb(255,233,69)'],],
        'Inferno': [[0.0, '#000004'], [0.1111111111111111, '#1b0c41'], [0.2222222222222222, '#4a0c6b'], [0.3333333333333333, '#781c6d'], [0.4444444444444444, '#a52c60'], [0.5555555555555556, '#cf4446'], [0.6666666666666666, '#ed6925'], [0.7777777777777777, '#fb9b06'], [0.8888888888888888, '#f7d13d'], [1.0, '#fcffa4'],],
        'Plasma': [[0.0, '#0d0887'], [0.1111111111111111, '#46039f'], [0.2222222222222222, '#7201a8'], [0.3333333333333333, '#9c179e'], [0.4444444444444444, '#bd3786'], [0.5555555555555556, '#d8576b'], [0.6666666666666666, '#ed7953'], [0.7777777777777777, '#fb9f3a'], [0.8888888888888888, '#fdca26'], [1.0, '#f0f921'],],
    }
    return scales[colorscale]
}
