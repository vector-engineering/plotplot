import { generateNullPlot, nanPlotsShown, truncateMiddle, getXAxis, getYAxis } from './PlotGroupUtils'
import { chromaNoException } from '../../utility';

export function prepPlot(graphJson, plotState, subsets, restrictZoomX, restrictZoomY, subsetOrder) {
    let layout = null;

    const lastRanges = plotState['lastRanges'];

    // Check for not loaded yet.
    if (!graphJson || !('layout' in graphJson) || !graphJson.layout) {
        let graph = generateNullPlot('Loading...', 'Loading...', ['Loading...'], 'scatter')
        layout = graph.layout
        graphJson = graph
    } else {
        layout = graphJson.layout;
    }

    if (lastRanges != null) {
        // If we just got a new plot, restore the ranges from our last plot.
        getXAxis(layout).range = [lastRanges.xmin, lastRanges.xmax]
        getYAxis(layout).range = [lastRanges.ymin, lastRanges.ymax]
    }
    //layout.title = {text: subset['name'], 'x': 0.25, 'xanchor': 'left', 'xref': 'paper'}
    layout.title = { text: '' }
    layout.margin = { l: '80', r: '20', b: '50', t: '20', pad: '4' }
    layout.autosize = true
    layout.dragmode = plotState.dragmode
    layout.clickmode = 'event'

    const xtype = plotState.xAxisLog ? 'log' : ''
    getXAxis(layout).type = xtype

    if (nanPlotsShown(layout)) {
        layout.xaxis.type = xtype
    }

    const ytype = plotState.yAxisLog ? 'log' : ''
    getYAxis(layout).type = ytype

    if (nanPlotsShown(layout)) {
        layout.yaxis4.type = ytype
    }

    let xScaleAnchor = 'x'
    if (nanPlotsShown(layout)) {
        xScaleAnchor = 'x3'
    }

    getYAxis(layout).type = plotState.yAxisLog ? 'log' : ''

    // If in log mode, don't render shapes with locations < 0
    let grayBoxShapes = []
    let outshapes = []
    if (layout.shapes) {
        for (let s of layout.shapes) {
            if (s.type == "rect") {
                grayBoxShapes.push(s)
            } else {
                outshapes.push(s)
            }
        }
    }
    for (let s of grayBoxShapes) {
        let includeShape = true
        if (plotState.xAxisLog) {
            if (s.x0 < 0 && s.x1 < 0) {
                includeShape = false
            } else {
                if (s.name == 'data-not-loaded-right') {
                    s.x1 = 1e100
                }
                s.x0 = Math.max(1e-100, s.x0)
                s.x1 = Math.max(1e-100, s.x1)
            }
        }

        if (plotState.yAxisLog) {
            if (s.y0 < 0 && s.y1 < 0) {
                includeShape = false
            } else {
                if (s.name == 'data-not-loaded-top') {
                    s.y1 = 1e100
                }
                s.y0 = Math.max(1e-100, s.y0)
                s.y1 = Math.max(1e-100, s.y1)
            }
        }
        if (includeShape) {
            outshapes.push(s)
        }
    }

    layout.shapes = outshapes
    layout.coloraxis = { showscale: false }

    layout.hovermode = plotState.hovermode
    

    if (!plotState.axisRatioUnlocked) {
        if (getYAxis(layout) != null) {
            getYAxis(layout).scaleanchor = xScaleAnchor
            getYAxis(layout).scaleratio = 1
        }
    } else {
        getYAxis(layout).scaleanchor = ""
    }
    let axis1to1Disabled = plotState.xAxisLog != plotState.yAxisLog
    if (axis1to1Disabled) {
    }

    if (plotState.axisRatioUnlocked) {
        getYAxis(layout).fixedrange = restrictZoomX
        getXAxis(layout).fixedrange = restrictZoomY
    }

    // Reorder plot data based on the order from the subset list.
    let reordered_data = graphJson.data
    
    if (plotState.plotSubsetIds) {

        // Add subset name to the hoverlist data.
        for (let i in reordered_data) {
            if ('hovertemplate' in reordered_data[i] && plotState.plotSubsetIds[i] in subsets) {

                const sub = subsets[plotState.plotSubsetIds[i]]

                let this_color = '#333333'
                try {
                    this_color = chromaNoException(sub['color']).alpha(0.4).hex();
                } catch (exception) {
                    this_color = '#333333'
                }

                const br_idx = reordered_data[i]['hovertemplate'].indexOf("<br>")
                if (br_idx !== -1) {
                    // reordered_data[i]['hovertemplate'] = '<b>' + 'Subset'.padEnd(hoverboxLongestColNameLen, ' ') + ':</b> ' + truncateMiddle(sub['name'], 35) + ' <span style="color: ' + this_color + '">⬤</span><br>' + reordered_data[i]['hovertemplate'].substring(br_idx + 4)

                    reordered_data[i]['hovertemplate'] = '<span style="color: ' + this_color + '">⬤</span> ' + truncateMiddle(sub['name'], 55) + ' <br>' + reordered_data[i]['hovertemplate'].substring(br_idx + 4)
                }
            }

            // if (!this.state.isVisible && 'type' in reordered_data[i] && reordered_data[i]['type'] == 'scattergl') {
            //     reordered_data[i]['type'] = 'scatter'
            // }
        }

        if (nanPlotsShown(graphJson.layout)) {
            // only sort the data subsets, which are always first in the data array.
            reordered_data = graphJson.data.slice(0, plotState.plotSubsetIds.length)
        }

        let idx_array = []
        for (let i = 0; i < plotState.plotSubsetIds.length; i++) {
            //let sub_id = plotSubsetIds[i]
            idx_array.push(i)
        }
        // idx_array:      [0, 1]
        // subsetOrder:    [0, 1, 2, 20, 19]
        // plotSubsetIds:  [19, 20]
        //
        // Want idx_array: [1, 0]

        // Reorder idx_array based on subset ids.
        idx_array.sort((a, b) => subsetOrder.indexOf(plotState.plotSubsetIds[a]) - subsetOrder.indexOf(plotState.plotSubsetIds[b]))

        // idx_array:      [1, 0]
        reordered_data = []
        for (let idx_out of idx_array) {
            reordered_data.push(graphJson.data[idx_out])
        }

        // Put the remaining NaN plots back in.
        if (nanPlotsShown(graphJson.layout)) {
            reordered_data = reordered_data.concat(graphJson.data.slice(plotState.plotSubsetIds.length))
        }
    }

    return {graphJson, reordered_data, layout}
}
