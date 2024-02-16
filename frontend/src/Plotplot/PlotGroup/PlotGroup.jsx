import React from 'react';
// import Plot from 'react-plotly.js';
import Plotly from 'custom-plotly.js';


import { DropArea } from './DropArea';
import { Button, Dropdown, Spinner, OverlayTrigger, Tooltip, Form, DropdownButton, ButtonGroup, Overlay } from 'react-bootstrap';
import ToggleButton from 'react-bootstrap/ToggleButton';
import { Polygon } from './Polygon';
import { AxisLogSwitch } from './AxisLogSwitch';
import { nFormatter, chromaNoException } from '../../utility';
import { ColorBarLegend } from './ColorBarLegend';
import { prepPlot } from './PrepPlot';
import Select from 'react-select'
import { getSubsetIds, numericArraysEqual, getMarkerColor, sortSelectedOptions, generateNullPlot, nanPlotsShown, subsetSelectedEntryFromSubset, getLayoutForPlotlyWhiteTemplate, doPlotColoring, truncateMiddle, getSubsetIdsInGraphOrder, getXAxis, getYAxis, getPlotWidthHeightPxUtil } from './PlotGroupUtils'
import { makeNameUnique } from '../../utility';
import { InView } from 'react-intersection-observer';

import { components } from 'react-select';

// customizable method: use your own `Plotly` object
import createPlotlyComponent from 'react-plotly.js/factory';
const Plot = createPlotlyComponent(Plotly);

class PlotGroup extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            copied: false,
            isDropdownOpen: false,
            isSelectMulti: false,
            plotHasInit: false,
            hoverboxLongestColNameLen: 0,
            lastSelectForShiftSelect: null,
            isVisible: true,
            drawingPolygons: null,
            isSelectingData: false,
            nanPlotSelection: null,
            captureMouseMove: false,
            colorSliderValues: null,
            colorSliderValuesFinal: null,
            colorSliderMin: 0,
            colorSliderMax: 0,
        }

        this.nBinsTimeout = null
        this.plotUpdateRangesTimeout = null
        this.nanDraggingState = [false, false, false, false]
        this.currentNanPositions = null
        this.bothNanChecked = false
        this.dropPlotX = this.dropPlotX.bind(this)
        this.dropPlotY = this.dropPlotY.bind(this)
        this.dropPlotZ = this.dropPlotZ.bind(this)
        this.handlePanZoom = this.handlePanZoom.bind(this)
        this.selectData = this.selectData.bind(this)
        this.finishDrawing = this.finishDrawing.bind(this)
        this.cancelDataSelection = this.cancelDataSelection.bind(this)
        this.handleDoubleClick = this.handleDoubleClick.bind(this)
        this.enableZoomBox = this.enableZoomBox.bind(this)
        this.toggleAxis1to1 = this.toggleAxis1to1.bind(this)
        this.doAutozoom = this.doAutozoom.bind(this)
        this.handleMouseMove = this.handleMouseMove.bind(this)
        this.getMousePosition = this.getMousePosition.bind(this)
        this.handleGraphClick = this.handleGraphClick.bind(this)
        this.handleGraphRightClick = this.handleGraphRightClick.bind(this)
        this.updatePolygonNow = this.updatePolygonNow.bind(this)
        this.endPolygon = this.endPolygon.bind(this)
        this.handleKeyUp = this.handleKeyUp.bind(this)
        this.setScatter = this.setScatter.bind(this)
        this.setHistogram = this.setHistogram.bind(this)
        this.setRankPlot = this.setRankPlot.bind(this)
        this.setNBins = this.setNBins.bind(this)
        this.multRanges = this.multRanges.bind(this)
        this.handleMouseMoveNan = this.handleMouseMoveNan.bind(this)
        this.handleShowNansClicked = this.handleShowNansClicked.bind(this)
        this.handleXaxisLog = this.handleXaxisLog.bind(this)
        this.handleYaxisLog = this.handleYaxisLog.bind(this)
        this.getXRange = this.getXRange.bind(this)
        this.getYRange = this.getYRange.bind(this)
        this.autozoomHelper = this.autozoomHelper.bind(this)
        this.handleSubsetClicked = this.handleSubsetClicked.bind(this)
        this.isOnlySubset = this.isOnlySubset.bind(this)
        this.subsetIsSelected = this.subsetIsSelected.bind(this)
        this.getNumberSubsetsSelected = this.getNumberSubsetsSelected.bind(this)
        this.handlePlotSubsetChanged = this.handlePlotSubsetChanged.bind(this)
        this.setHistType = this.setHistType.bind(this)
        this.doSafariScrollFix = this.doSafariScrollFix.bind(this)
        this.doPlotInit = this.doPlotInit.bind(this)
        this.getSubsetRows = this.getSubsetRows.bind(this)
        this.getTitle = this.getTitle.bind(this)
        this.clearZAxis = this.clearZAxis.bind(this)
        this.flipColorScale = this.flipColorScale.bind(this)
        this.setColorScale = this.setColorScale.bind(this)
        this.getPlotWidthHeightPx = this.getPlotWidthHeightPx.bind(this)
        this.onColorSliderChange = this.onColorSliderChange.bind(this)
        this.onColorSliderFinalChange = this.onColorSliderFinalChange.bind(this)

        this.selectDivRef = React.createRef();
        let plotTitleTimeout = null

    }

    onColorSliderChange(values) {
        this.setState({
            colorSliderValues: values,
        })
    }

    onColorSliderFinalChange(values, is_selecting = null) {
        this.setState({
            colorSliderValuesFinal: values,
        })
        if (is_selecting === null) {
            is_selecting = this.state.isSelectingData
        }
        const subset_ids = getSubsetIdsInGraphOrder(this.props.state.subsetsSelected, this.props.subsetOrder)
        doPlotColoring(this.props.state.graphJson, this.props.subsets, this.props.state.zAxis, subset_ids, this.props.state.colorscaleFlipped, this.props.state.colorscale, this.props.state.minmaxRanges, is_selecting, values)
    }

    isOnlySubset(value) {
        if (this.props.state.subsetsSelected !== null && this.props.state.subsetsSelected['value'] == value) {
            return true
        } else {
            return false
        }
    }

    subsetIsSelected(subset_id) {
        const subsetsSelected = this.props.state.subsetsSelected
        if (subsetsSelected) {
            if (subsetsSelected['value'] == subset_id) {
                return true
            } else if (subsetsSelected.length > 0) {
                for (const sub of subsetsSelected) {
                    if (sub['value'] == subset_id) {
                        return true
                    }
                }
            }
        }
        return false
    }

    doSafariScrollFix(div) {
        // Safari will pass a wheel event through the plot, up to the main div that causes all of the plots to scroll.
        // This breaks the scrolling behavior of the plots.  We add a *non-passive* event listener that prevents the
        // wheel event from doing the default thing of emitting a scroll event when the user is causing wheel events on
        // the div that contains the plot.
        if (window.safari !== undefined && div) {
            console.log('Running Safari scroll fix')
            div.addEventListener("wheel", e => e.preventDefault(), { passive: false })
        }
    }

    doPlotInit() {
        if (this.props.state.graphJson == null) {
            let subs = null
            if ((this.props.state.subsetsSelected == null || (Array.isArray(this.props.state.subsetsSelected) && this.props.state.subsetsSelected.length == 0))) {
                subs = subsetSelectedEntryFromSubset(this.props.subsets, this.props.subsets[0])
                this.props.setPlotState({
                    subsetsSelected: subs
                })
            } else {
                subs = this.props.state.subsetsSelected
            }
            this.getPlot(this.props.state.xAxis, this.props.state.yAxis, this.props.state.lastRanges, subs)
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        // console.log(this.state.isVisible + ' ' + nextState.isVisible)

        // Always load at least once.
        // if (!this.props.state.graphJson) {
        //     return true
        // }
        return this.state.isVisible || nextState.isVisible
    }

    componentDidMount() {
        this.props.setPlotState({
            dragmode: 'pan'
        })
        document.addEventListener("keyup", this.handleKeyUp, false);

    }

    componentWillUnmount() {
        document.removeEventListener("keyup", this.handleKeyUp, false);

        // if (window.safari !== undefined) {
        //     document.removeEventListener("wheel", g_scrollEventListener)
        // }
    }

    componentDidUpdate() {
        if (!this.state.plotHasInit) {
            // Make sure subsets are definied before we try to init the plot.
            if (this.props.subsets !== undefined && 0 in this.props.subsets) {
                this.setState({
                    plotHasInit: true,
                })
                this.doPlotInit()
            }
        }

        if (this.props.state.forceUpdateNow) {
            const subs = this.props.state.subsetsSelected == null ? null : this.props.state.subsetsSelected
            this.getPlot(this.props.state.xAxis, this.props.state.yAxis, this.props.state.lastRanges, subs)
        }
    }

    dropPlotX(item) {
        let ptype = 'scatter'
        if (this.props.state.plotType == 'histogram') {
            ptype = 'histogram'
        }
        this.getPlot(item.name, this.props.state.yAxis, null, null, ptype, null, null, this.props.calculateCorrelations)
    }

    dropPlotY(item) {
        let ptype = 'scatter'
        if (this.props.state.plotType == 'rank') {
            ptype = 'rank'
        }
        this.getPlot(this.props.state.xAxis, item.name, null, null, ptype, null, null, this.props.calculateCorrelations)
    }

    dropPlotZ(item) {
        let ptype = 'scatter'
        if (this.props.state.plotType == 'rank') {
            ptype = 'rank'
        }
        this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, ptype, null, null, this.props.calculateCorrelations, null, item.name)
    }

    clearZAxis() {
        this.dropPlotZ({ name: '' })
    }

    flipColorScale() {
        const newFlipped = !this.props.state.colorscaleFlipped
        this.props.setPlotState({
            colorscaleFlipped: newFlipped,
        })

        const subset_ids = getSubsetIdsInGraphOrder(this.props.state.subsetsSelected, this.props.subsetOrder)
        doPlotColoring(this.props.state.graphJson, this.props.subsets, this.props.state.zAxis, subset_ids, newFlipped, this.props.state.colorscale, this.props.state.minmaxRanges, this.state.isSelectingData, this.state.colorSliderValuesFinal)
    }

    setColorScale(colorscale) {
        this.props.setPlotState({
            colorscale: colorscale
        })

        const subset_ids = getSubsetIdsInGraphOrder(this.props.state.subsetsSelected, this.props.subsetOrder)
        doPlotColoring(this.props.state.graphJson, this.props.subsets, this.props.state.zAxis, subset_ids, this.props.state.colorscaleFlipped, colorscale, this.props.state.minmaxRanges, this.state.isSelectingData, this.state.colorSliderValuesFinal)
    }

    getTitle() {
        if (this.props.state.title != null && this.props.state.title.length > 0) {
            return this.props.state.title
        } else {
            if (this.props.state.xAxis == null || this.props.state.yAxis == null) {
                // No vars.
                return ''
            } else {
                return this.props.state.xAxis + " vs. " + this.props.state.yAxis
            }
        }
    }

    getPlot(x, y, ranges = null, subsets = null, plotType = null, nansRequest = null, forceAutozoom = false, callback = null, histType = null, zAxis = null) {
        if (this.state.isSelectingData) {
            this.cancelDataSelection(false)
        }
        const current_subsets = getSubsetIds(this.props.state.subsetsSelected)
        const lastPlotType = this.props.state.plotType
        const xWasNull = this.props.state.xAxis == null
        const yWasNull = this.props.state.yAxis == null

        // Need to do this before setting any other state, otherwise can get stuck in an infinite loop.
        this.props.setPlotState({
            forceUpdateNow: false,
        })

        if (plotType == null) {
            plotType = this.props.state.plotType
        }

        if (nansRequest == null) {
            nansRequest = this.props.state.nansRequest
        }

        if (histType == null) {
            histType = this.props.state.histType
        }

        if (zAxis === null) {
            zAxis = this.props.state.zAxis
        }

        if (x != this.props.state.xAxis || y != this.props.state.yAxis) {
            // show nans if they exist on variable change.
            nansRequest = null
        }

        let subsetsChanged = false
        let subset_ids = null
        if (subsets == null) {
            subsets = this.props.state.subsetsSelected
        }
        if (subsets) {
            subset_ids = getSubsetIds(subsets)
        } else {
            subset_ids = [0]
        }

        if (!numericArraysEqual(subset_ids, current_subsets)) {
            subsetsChanged = true
        }

        // Check for a few different types of empty plot.  We can avoid a backend call if any of these are true.
        if (subset_ids.length < 1
            || plotType == 'scatter' && (x == null || y == null)
            || plotType == 'rank' && (x == null && y == null)
            || plotType == 'histogram' && (x == null && y == null)) {
            let graph = generateNullPlot(x, y, subsets, plotType)
            const subsets_sorted = sortSelectedOptions(subsets, this.props.subsetOrder)
            this.props.setPlotState({
                graphJson: graph,
                xAxis: x,
                yAxis: y,
                // validRanges: validRanges,
                updatePending: false,
                subsetsSelected: subsets_sorted,
                initialRanges: null,
                plotType: plotType,
                isHeatmap: false,
                // lastRanges: lastRanges,
                // bothNan: bothNan,
                // axisRatioUnlocked: axisRatioUnlocked,
                // minmaxRanges: minmaxRanges,
                // nansRequest: nansRequest,
                // numNans: numNans,
                corrUpdatePending: true, // show -.--- for correlations
            }
            );
            // Save the subset ids of the current plot as well.
            this.props.setPlotState({
                plotSubsetIds: subset_ids,
            })
            return
        }

        let request_vals = {}
        if (this.rangeValid(ranges) && (plotType != 'rank' || !subsetsChanged)) {

            // Add some margin, maybe about doubling the range.
            const xmargin = (ranges.xmax - ranges.xmin) * 1.0
            const ymargin = (ranges.ymax - ranges.ymin) * 1.0

            request_vals = { xmin: ranges.xmin, xmax: ranges.xmax, ymin: ranges.ymin, ymax: ranges.ymax, xmargin: xmargin, ymargin: ymargin }

            // Ranges in plotly are never stored with the log transform applied.  When we request data, apply that
            // transform if the plot is shown in log mode.
            if (this.props.state.xAxisLog) {
                request_vals.xmin = Math.pow(10, request_vals.xmin - 1)
                request_vals.xmax = Math.pow(10, request_vals.xmax + 1)
            }

            if (this.props.state.yAxisLog) {
                request_vals.ymin = Math.pow(10, request_vals.ymin - 1)
                request_vals.ymax = Math.pow(10, request_vals.ymax + 1)
            }
        }
        const requestNum = this.props.state.requestNumber

        let corrUpdate = false;
        if (callback) {
            corrUpdate = (callback.toString() === this.props.calculateCorrelations.toString());

        }

        this.props.setPlotState({
            updatePending: true,
            corrUpdatePending: corrUpdate,
            requestNumber: requestNum + 1,
            requestInFlight: requestNum,
        })

        let nbins = this.props.state.nBins
        if (typeof nbins == 'undefined' || nbins <= 0) {
            this.props.setPlotState({
                nBins: 50
            })
            nbins = 50
        }

        request_vals['x'] = x
        request_vals['y'] = y
        request_vals['z'] = zAxis
        request_vals['subsets'] = subset_ids
        request_vals['key'] = this.props.plotKey
        request_vals['plot_type'] = plotType
        request_vals['hist_type'] = this.props.state.histType ? this.props.state.histType : 'count'
        request_vals['nbins'] = nbins
        request_vals['xlog'] = this.props.state.xAxisLog
        request_vals['ylog'] = this.props.state.yAxisLog
        request_vals['hoverlist'] = Array.from(this.props.hoverlist)

        let nansOut = nansRequest
        if (nansOut == null) {
            nansOut = 'auto'
        }
        request_vals['nans_request'] = nansOut


        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request_vals)
        }

        fetch("api/" + this.props.dataId + "/plot_json", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.toastError(result['error'])
                        this.props.setPlotState({
                            updatePending: false
                        })
                        return
                    }
                    if ('preempt' in result || requestNum != this.props.state.requestInFlight) {
                        console.log('ignoring out of date fetch result, requestNum: ' + requestNum + ' , requestInFlight: ' + this.props.state.requestInFlight)
                        console.log(result)
                        return
                    }
                    const currentGraph = this.props.state.graphJson
                    const validRanges = result[1]['validRanges']
                    const bothNan = result[1]['both_nan']
                    const minmaxRanges = result[1]['minmax']
                    const numNans = result[1]['num_nan']
                    const plot_supports_hovering = result[1]['plot_supports_hovering']
                    const hoverbox_longest_col_name_len = result[1]['hoverbox_longest_col_name_len']

                    // Keep any objects currently drawn there.
                    let graphJson = result[0]

                    if (!nanPlotsShown(graphJson.layout)) {
                        // Fix for a bug in Plotly where without forcing a relayout
                        // the axis will retain the shorted subplot axis.
                        var gd = document.getElementById('plotDivId' + this.props.plotKey);
                        if (gd != null) {
                            setTimeout(() => { Plotly.relayout(gd, { 'xaxis.domain': [0, 1] }) }, 10)
                        }
                    }

                    let nansRequest = this.props.state.nansRequest
                    if (nansRequest != null) {
                        // If not in auto mode, change the request state to whatever the backend gave us
                        if (nanPlotsShown(graphJson.layout)) {
                            nansRequest = 'show'
                        } else {
                            nansRequest = 'hide'
                        }
                    }


                    if (currentGraph != null && currentGraph.layout != null && currentGraph.layout.shapes != null) {
                        // Keep our current drawn shapes.

                        if (graphJson.layout != null && graphJson.layout.shapes != null) {
                            graphJson.layout.shapes = graphJson.layout.shapes.concat(this.filterShapes(currentGraph.layout.shapes, true))
                        } else {
                            graphJson.layout.shapes = this.filterShapes(currentGraph.layout.shapes, true)
                        }
                    }

                    const plotType = result[1]['plot_type']
                    const isHeatmap = result[1]['is_heatmap']
                    let lastRanges = this.props.state.lastRanges
                    let axisRatioUnlocked = this.props.state.axisRatioUnlocked

                    if (plotType != lastPlotType || (plotType == 'scatter' && (xWasNull || yWasNull)) || forceAutozoom) {
                        // Plot type changed, force an autoscale
                        lastRanges = this.autozoomHelper(minmaxRanges)
                    }

                    if (plotType != 'scatter') {
                        axisRatioUnlocked = true
                    }

                    // Convert the subsets into subsetsSeletected state
                    const subsets_in = result[1]['subsets']
                    let subsets_out = []
                    if (subsets_in.length < 1) {
                        subsets_out = subsetSelectedEntryFromSubset(this.props.subsets, this.props.subsets[0])
                    } else if (subsets_in.length == 1) {
                        subsets_out = subsetSelectedEntryFromSubset(this.props.subsets, subsets_in[0])
                    } else {
                        for (let i in subsets_in) {
                            const sub = subsets_in[i]
                            subsets_out.push(subsetSelectedEntryFromSubset(this.props.subsets, sub))
                        }
                    }

                    const subset_ids = getSubsetIds(subsets_out)

                    // If the user is plotting density, don't let them choose a weird colorscale
                    let colorscale = null
                    if (zAxis && zAxis != '') {
                        colorscale = this.props.state.colorscale
                    }

                    // Plot/marker coloring for things other than heatmaps are handled on the frontend so that we can change colors without
                    // regenerating the plot.  Override colors here.
                    const subset_ids_in_order = getSubsetIdsInGraphOrder(subsets_out, this.props.subsetOrder)
                    graphJson = doPlotColoring(graphJson, this.props.subsets, zAxis, subset_ids_in_order, this.props.state.colorscaleFlipped, colorscale, minmaxRanges, this.state.isSelectingData, this.state.colorSliderValuesFinal)

                    const subsets_sorted = sortSelectedOptions(subsets_out, this.props.subsetOrder)

                    // Save the subset ids of the current plot as well.
                    this.setState({
                        hoverboxLongestColNameLen: hoverbox_longest_col_name_len,
                        colorSliderValues: [minmaxRanges['cmin'], minmaxRanges['cmax']],
                        colorSliderValuesFinal: [minmaxRanges['cmin'], minmaxRanges['cmax']],
                        colorSliderMin: minmaxRanges['cmin'],
                        colorSliderMax: minmaxRanges['cmax'],
                    })

                    graphJson.layout.template = getLayoutForPlotlyWhiteTemplate()

                    this.props.setPlotState({
                        graphJson: graphJson,
                        xAxis: x,
                        yAxis: y,
                        zAxis: zAxis,
                        validRanges: validRanges,
                        updatePending: false,
                        subsetsSelected: subsets_sorted,
                        initialRanges: null,
                        plotType: plotType,
                        isHeatmap: isHeatmap,
                        lastRanges: lastRanges,
                        bothNan: bothNan,
                        axisRatioUnlocked: axisRatioUnlocked,
                        minmaxRanges: minmaxRanges,
                        nansRequest: nansRequest,
                        numNans: numNans,
                        plotSupportsHovering: plot_supports_hovering,
                        hovermode: graphJson.layout.hovermode,
                        colorscale: colorscale,
                        plotSubsetIds: subset_ids,
                    }, callback
                    );
                }
            )
    }

    handleDoubleClick() {
        if (this.state.isSelectingData) {
            return
        }
        this.doAutozoom()
    }

    autozoomHelper(minmaxRanges) {
        let ranges = this.multRanges(minmaxRanges, 0) // this is just a copy
        if (this.props.state.xAxisLog) {
            ranges.xmin = Math.log10(ranges.xmin)
            ranges.xmax = Math.log10(ranges.xmax)
        }

        if (this.props.state.yAxisLog) {
            ranges.ymin = Math.log10(ranges.ymin)
            ranges.ymax = Math.log10(ranges.ymax)
        }

        ranges = this.multRanges(ranges, 0.10)
        return ranges
    }

    doAutozoom() {
        // Never use Plotly's autorange function.  It leaves the plot in a weird state where the
        // internal ranges are not correctly updated.  This causes issues when doing drawing.  Instead
        // the backend computes min/maxes for us.  We can add 5% to each side to get good autoranging.
        if (this.props.state.minmaxRanges != null) {
            let ranges = this.autozoomHelper(this.props.state.minmaxRanges)

            this.props.setPlotState({
                lastRanges: ranges
            })
        }
    }

    multRanges(ranges, mult) {
        const xdelta = ranges.xmax - ranges.xmin
        const ydelta = ranges.ymax - ranges.ymin
        return {
            xmin: ranges.xmin - xdelta * mult,
            xmax: ranges.xmax + xdelta * mult,
            ymin: ranges.ymin - ydelta * mult,
            ymax: ranges.ymax + ydelta * mult,
        }
    }

    parseRanges(ranges) {
        let axisNum = ''
        if (this.props.state.graphJson && nanPlotsShown(this.props.state.graphJson.layout)) {
            // Extract x/y axis3 from ranges.
            axisNum = '3'
        }

        return {
            xmin: parseFloat(ranges["xaxis" + axisNum + ".range[0]"]),
            ymin: parseFloat(ranges["yaxis" + axisNum + ".range[0]"]),
            xmax: parseFloat(ranges["xaxis" + axisNum + ".range[1]"]),
            ymax: parseFloat(ranges["yaxis" + axisNum + ".range[1]"]),
        }
    }

    handlePanZoom(ranges_in) {
        // Plotly calls this function when we are drawing shapes, but we only want
        // to handle panning and zooming events.
        if (ranges_in.hasOwnProperty('shapes')) {
            return
        }

        const xAxis = this.props.state.xAxis
        const yAxis = this.props.state.yAxis
        const validRanges = this.props.state.validRanges
        const initialRanges = this.props.state.initialRanges
        const plotType = this.props.state.plotType

        // If the user just used the drag-to-zoom, reset to pan.
        if (this.props.state.dragmode == 'zoom') {
            this.props.setPlotState({
                dragmode: 'pan'
            })
        }

        // Convert ranges into an easier format to use
        let ranges = this.parseRanges(ranges_in)

        // If we are zooming only on one axis, we might need to save the old ranges for the other axis (since it will not be provided in the event.)
        if (isNaN(ranges.xmax) && isNaN(ranges.xmin) && !isNaN(ranges.ymax) && !isNaN(ranges.ymin) && !isNaN(this.props.state.lastRanges.xmin) && !isNaN(this.props.state.lastRanges.xmax)) {
            ranges.xmax = this.props.state.lastRanges.xmax
            ranges.xmin = this.props.state.lastRanges.xmin
        } else if (isNaN(ranges.ymax) && isNaN(ranges.ymin) && !isNaN(ranges.xmax) && !isNaN(ranges.xmin) && !isNaN(this.props.state.lastRanges.ymin) && !isNaN(this.props.state.lastRanges.ymax)) {
            ranges.ymax = this.props.state.lastRanges.ymax
            ranges.ymin = this.props.state.lastRanges.ymin
        }

        if (this.rangeValid(ranges)) {
            this.props.setPlotState({
                lastRanges: ranges
            })
        }
        if (!this.rangeValid(validRanges) && plotType == 'scatter' && !this.props.state.isHeatmap) {
            // If valid ranges is null, that means we are looking at all the data.
            // Don't request new data.
            return
        }

        if (plotType == 'histogram') {
            return
        }


        // Determine if we need to change the graph.
        // We change the graph for the following reasons:
        //  1. Zoom has changed by >= 2x (or whatever).
        //  2. We are outside the valid-data bounding box.

        // Compute current area
        let area = this.computeArea(ranges)
        let lastArea = this.computeArea(initialRanges)

        if (lastArea == null || lastArea == 0 || area == null || area == 0) {
            // We don't have data about the min/max.  Just save our current view to use for zoom computation.
            if (this.rangeValid(ranges)) {
                this.props.setPlotState({
                    initialRanges: ranges
                })
            }
        } else {
            const zoomInFactorTrigger = 5
            let zoomOutFactorTrigger = 7.5

            if (!this.rangeValid(validRanges) && this.props.state.isHeatmap) {
                // We are looking at all of the data in a heatmap, don't trigger anything on a zoom out.
                zoomOutFactorTrigger = 1e7
            }

            if (area / lastArea < 1.0 / zoomInFactorTrigger || area / lastArea > zoomOutFactorTrigger) {
                console.log("Zoom triggered plot update")
                this.getPlot(xAxis, yAxis, ranges);
                return
            }
        }

        // Check if we are outside the bounding box.
        if (this.rangeValid(ranges) && this.rangeValid(validRanges)) {

            // Ranges in plotly are never stored with the log transform applied.  Apply if needed.
            const ranges2 = structuredClone(ranges);

            if (this.props.state.xAxisLog) {
                ranges2.xmin = Math.pow(10, ranges2.xmin)
                ranges2.xmax = Math.pow(10, ranges2.xmax)
            }

            if (this.props.state.yAxisLog) {
                ranges2.ymin = Math.pow(10, ranges2.ymin)
                ranges2.ymax = Math.pow(10, ranges2.ymax)
            }

            if (ranges2.xmin < validRanges.xmin || ranges2.xmax > validRanges.xmax || ranges2.ymin < validRanges.ymin || ranges2.ymax > validRanges.ymax) {
                console.log("Outside of valid range, triggering plot update.")
                this.getPlot(xAxis, yAxis, ranges)
                return
            }
        }
    }

    rangeValid(range) {
        if (range == null) {
            return false
        }
        if (range.xmax == null || range.xmin == null || range.ymax == null || range.ymin == null) {
            return false
        }
        if (isNaN(range.xmax) || isNaN(range.xmin) || isNaN(range.ymax) || isNaN(range.ymin)) {
            return false
        }
        return true
    }

    computeArea(lastRanges) {
        if (!this.rangeValid(lastRanges)) {
            return null
        }
        return (lastRanges.xmax - lastRanges.xmin) * (lastRanges.ymax - lastRanges.ymin)
    }

    selectData() {
        // After doing an autoscale, Plotly will report an incorrect range.  If we force a
        // relayout, it works around the issue.
        var gd = document.getElementById('plotDivId' + this.props.plotKey);
        //setTimeout(() => {Plotly.relayout(gd, {'xaxis.title': gd.layout.xaxis.title})}, 1)
        this.setState({
            isSelectingData: true,
            nanPlotSelection: [null, null, null, null]
        })
    }


    filterShapes(shapes, editable) {
        let out = []
        for (let s of shapes) {
            if (s.editable == editable) {
                out.push(s)
            }
        }
        return out
    }

    cancelDataSelection(recolor_plots = true) {
        // Delete any shapes
        let graphJson = this.props.state.graphJson
        if (!graphJson || !graphJson.layout) {
            return
        }
        if (typeof graphJson.layout.shapes != 'undefined') {
            graphJson.layout.shapes = this.filterShapes(graphJson.layout.shapes, false)
        }

        this.props.setPlotState({
            graphJson: graphJson,
        })

        const colorSliderValuesFinal = [this.state.colorSliderMin, this.state.colorSliderMax]
        this.setState({
            drawingPolygons: [],
            isSelectingData: false,
            colorSliderValues: colorSliderValuesFinal,
            colorSliderValuesFinal: colorSliderValuesFinal,
        })

        if (recolor_plots) {
            this.onColorSliderFinalChange(colorSliderValuesFinal, false)
        }
    }

    getPlotWidthHeightPx() {
        // Try to get the width of the plot from the browser.
        // document.querySelector("#plotDivIdln52ewa74v0c65054bm > div > div > svg:nth-child(1) > g.draglayer.cursor-move > g > rect.nsewdrag.drag")
        // document.querySelector("#plotDivIdln52ewa74v0c65054bm > div > div > svg:nth-child(1) > g.draglayer.cursor-move > g.x3y3 > rect.nsewdrag.drag")
        const plotId = 'plotDivId' + this.props.plotKey

        if (!this.props.state.graphJson || !this.props.state.graphJson.layout) {
            return [0, 0]
        }
        return getPlotWidthHeightPxUtil(plotId, nanPlotsShown(this.props.state.graphJson.layout))
    }

    getMousePosition(e) {
        // From: https://codepen.io/therealsquidgee/pen/EmbOzX
        const plotId = 'plotDivId' + this.props.plotKey
        let [plotWidth, plotHeight] = this.getPlotWidthHeightPx()
        var gd = document.getElementById(plotId);

        var margin = gd._fullLayout.margin;
        var offsets = gd.getBoundingClientRect();

        // Handle subplots.        
        let top_plot_height = 0
        let plotFactor = 1
        if (nanPlotsShown(this.props.state.graphJson.layout)) {
            top_plot_height = (offsets.height - margin.t) * 0.15
            plotFactor = 0.85
        }

        //Calculate linear function to convert x coord
        var xy1 = getXAxis(gd.layout).range[0];
        var xy2 = getXAxis(gd.layout).range[1];
        var xx1 = offsets.left + margin.l;
        //var xx2 = offsets.left + gd.offsetWidth * plotFactor - margin.r; // compute the right edge plot


        var mx = (xy2 - xy1) / plotWidth //(xx2 - xx1);
        var cx = -(mx * xx1) + xy1;

        //Calculate linear function to convert y coord
        var yy1 = getYAxis(gd.layout).range[0];
        var yy2 = getYAxis(gd.layout).range[1];
        var yx1 = offsets.top + gd.offsetHeight * plotFactor - margin.b + top_plot_height;
        //var yx2 = offsets.top + margin.t + top_plot_height;
        var my = (yy2 - yy1) / -plotHeight // (yx2 - yx1);
        var cy = -(my * yx1) + yy1;

        var xInDataCoord = mx * e.clientX + cx;
        var yInDataCoord = my * e.clientY + cy;


        if (this.props.state.xAxisLog) {
            xInDataCoord = Math.pow(10, xInDataCoord)
        }
        if (this.props.state.yAxisLog) {
            yInDataCoord = Math.pow(10, yInDataCoord)
        }

        return [xInDataCoord, yInDataCoord]
    }

    handleMouseMove(e) {
        const isSelectingData = this.state.isSelectingData

        if (isSelectingData) {
            let pos = this.getMousePosition(e)
            let polys = this.state.drawingPolygons
            // this.props.updatePlotCursor(pos[0], pos[1]);
            if (typeof polys == 'undefined' || polys == null || polys.length < 1) {
                return
            }

            this.updatePolygonNow(polys, pos, e.buttons, e)
        }
    }

    handleKeyUp(e) {
        if (!this.state.isSelectingData) {
            return
        }
        if (e.code == 'Enter') {
            this.finishDrawing();
        } else if (e.code == 'Escape') {
            // If the user still has a path active, just close.
            let polys = this.state.drawingPolygons
            if (polys == null) {
                return
            }
            const numShapes = polys.length
            if (numShapes < 1) {
                return
            }
            if (this.state.drawingPolygons[numShapes - 1].hasPoints()) {
                // Polygon is not closed yet.
                //this.endPolygon()
                let numPolys = polys.length
                polys[numPolys - 1].removeLastPoint()
                this.setState({
                    drawingPolygons: polys
                })
                this.updatePolygonNow(polys, polys[numPolys - 1].lastPreviewPos)

                return
            }
        }
    }

    handleGraphClick(e) {
        // if (this.state.subsetsMenuIsOpen) {
        //     this.setState({
        //         subsetsMenuIsOpen: false
        //     })
        this.selectItem.blur()
        // }
        const isSelectingData = this.state.isSelectingData

        if (!isSelectingData) {
            return
        }
        const mousePos = this.getMousePosition(e)

        // Check for a click inside NaN plots.
        if (nanPlotsShown(this.props.state.graphJson.layout)) {

            if (mousePos[1] > this.getYRange(1)) {
                // Click is inside top plot
                var gd = document.getElementById('plotDivId' + this.props.plotKey);
                gd.onmousemove = null

                // Check if we are clicking on a 
                this.props.setPlotState({
                    dragmode: false,
                })
                return
            }

        }

        if (e.detail == 2) {
            // Double click
            if (this.state.isSelectingData) {
                this.endPolygon()
                return
            }
        }

        let polys = this.state.drawingPolygons

        if (typeof polys == 'undefined' || polys == null || polys.length < 1) {
            polys = [new Polygon()]
        }

        let numPolys = polys.length
        polys[numPolys - 1].addPoint(mousePos)

        // Place a new point in the polygon.
        this.setState({
            drawingPolygons: polys
        })

        this.updatePolygonNow(polys)
    }

    handleGraphRightClick(e) {
        if (!this.state.isSelectingData) {
            return
        }
        this.endPolygon()
        e.preventDefault()
    }

    endPolygon() {
        let polys = this.state.drawingPolygons
        if (polys) {
            polys.push(new Polygon())
            this.setState({
                drawingPolygons: polys
            })
            this.updatePolygonNow(polys)
        }
    }

    updatePolygonNow(polys, previewPos = null, buttons = 0, mouseMoveEvent = null) {
        if (polys.length < 1) {
            return
        }
        let shapes = []
        let xmin = Infinity
        let xmax = -Infinity
        let ymin = Infinity
        let ymax = -Infinity

        for (let i = 0; i < polys.length - 1; i++) {
            if (polys[i].hasPoints()) {
                shapes.push(polys[i].getShape(this.props.state.graphJson.layout))

                const xy_minmax = polys[i].xyMinMax()
                xmin = Math.min(xmin, xy_minmax[0])
                xmax = Math.max(xmax, xy_minmax[1])

                ymin = Math.min(ymin, xy_minmax[2])
                ymax = Math.max(ymax, xy_minmax[3])
            }
        }

        if (polys[polys.length - 1].hasPoints()) {
            if (previewPos == null) {
                shapes.push(polys[polys.length - 1].getShape(this.props.state.graphJson.layout))
            } else {
                shapes.push(polys[polys.length - 1].getShapeWithPreview(previewPos, this.props.state.graphJson.layout))
            }
            const xy_minmax = polys[polys.length - 1].xyMinMax(previewPos)
            xmin = Math.min(xmin, xy_minmax[0])
            xmax = Math.max(xmax, xy_minmax[1])

            ymin = Math.min(ymin, xy_minmax[2])
            ymax = Math.max(ymax, xy_minmax[3])
        }

        if (nanPlotsShown(this.props.state.graphJson.layout)) {
            let nan_select = [xmin, xmax, ymin, ymax]
            for (let i = 0; i < 4; i++) {
                if (this.state.nanPlotSelection[i] != null) {
                    nan_select[i] = this.state.nanPlotSelection[i]
                }
            }

            if (buttons == 0) {
                for (let i = 0; i < 4; i++) {
                    let nanPlotSelection = this.state.nanPlotSelection
                    if (this.nanDraggingState[i]) {
                        // This marker was being dragged, save its new position
                        if (i < 2) {
                            // top bar
                            nanPlotSelection[i] = previewPos[0]
                        } else {
                            nanPlotSelection[i] = previewPos[1]
                        }
                        nan_select[i] = nanPlotSelection[i]
                        this.setState({
                            nanPlotSelection: nanPlotSelection,
                            captureMouseMove: false,
                        })
                        break
                    }
                }
                this.nanDraggingState = [false, false, false, false]
            }

            const nanMarkerWidth = 5
            const mouseMoveNanOut = this.handleMouseMoveNan(nan_select, previewPos, buttons, nanMarkerWidth, mouseMoveEvent)
            const mouseMovePositions = mouseMoveNanOut[0]
            const mouseMoveColors = mouseMoveNanOut[1]
            this.currentNanPositions = mouseMovePositions
            const nan_shapes = this.getNanMakers(mouseMovePositions, mouseMoveColors, nanMarkerWidth)
            for (let s of nan_shapes) {
                shapes.push(s)
            }

        }

        let gd = document.getElementById('plotDivId' + this.props.plotKey);

        setTimeout(() => { Plotly.relayout(gd, { 'shapes': shapes }) }, 1)
    }

    getXRange(zero_or_one) {
        let x = getXAxis(this.props.state.graphJson.layout).range[zero_or_one]
        if (this.props.state.xAxisLog) {
            x = Math.pow(10, x)
        }
        return x
    }

    getYRange(zero_or_one) {
        let y = getYAxis(this.props.state.graphJson.layout).range[zero_or_one]
        if (this.props.state.yAxisLog) {
            y = Math.pow(10, y)
        }
        return y
    }

    handleMouseMoveNan(nan_select, mousePositionInPlotCoords, buttons, nanMarkerWidth, mouseMoveEvent) {

        // Compute if we are overlaping a marker.
        let colors = []
        for (let i = 0; i < 4; i++) {
            colors.push('rgba(0, 0, 0, .7)')
        }

        let isOverPlot = true
        if (mouseMoveEvent != null) {
            const elementsUnderCursor = document.elementsFromPoint(mouseMoveEvent.clientX, mouseMoveEvent.clientY)
            const gd = document.getElementById('plotDivId' + this.props.plotKey);
            isOverPlot = elementsUnderCursor.includes(gd)
        }

        let captureMouseMove = false

        let out = nan_select

        if (!isOverPlot) {
            for (let i = 0; i < 4; i++) {
                this.nanDraggingState[i] = false
            }
        }

        if (mousePositionInPlotCoords != null && isOverPlot) {
            const isOverTopPlot = mousePositionInPlotCoords[1] > this.getYRange(1)

            const isOverRightPlot = mousePositionInPlotCoords[0] > this.getXRange(1)

            let overPlot = false
            let mousePosXorY = null
            let rangeDelta = 0
            let layout = this.props.state.graphJson.layout
            let isLog = false

            for (let i = 0; i < 4; i++) {
                if (i < 2) {
                    // top plot, x axis
                    overPlot = isOverTopPlot
                    mousePosXorY = mousePositionInPlotCoords[0]

                    rangeDelta = getXAxis(layout).range[1] - getXAxis(layout).range[0] // deliberately not correcting for log because we want to end up with a ~px value
                    isLog = this.props.state.xAxisLog

                } else {
                    overPlot = isOverRightPlot
                    mousePosXorY = mousePositionInPlotCoords[1]

                    rangeDelta = getYAxis(layout).range[1] - getYAxis(layout).range[0] // deliberately not correcting for log because we want to end up with a ~px value
                    isLog = this.props.state.yAxisLog
                }

                // Set the width to about 3% of the range.
                let mouseDelta = Math.abs(mousePosXorY - nan_select[i])
                if (isLog) {
                    mouseDelta = Math.abs(Math.log10(mousePosXorY) - Math.log10(nan_select[i]))
                }

                const threshold = rangeDelta * 0.03

                if (overPlot && mouseDelta < threshold) {
                    captureMouseMove = true
                    colors[i] = '#0D6EFD'

                    if (buttons == 1) {
                        this.nanDraggingState[i] = true
                        out[i] = mousePosXorY
                    }
                }
            }


            for (let i = 0; i < 4; i++) {
                const mousePosXorY = i < 2 ? mousePositionInPlotCoords[0] : mousePositionInPlotCoords[1]

                if (this.nanDraggingState[i]) {
                    colors[i] = '#0D6EFD'
                    out[i] = mousePosXorY
                    captureMouseMove = true
                }

            }
        }

        if (this.state.captureMouseMove != captureMouseMove) {
            this.setState({
                captureMouseMove: captureMouseMove,
            })
        }
        return [out, colors]
    }

    getNanMakers(mouseMovePositions, mouseMoveColors, nanMarkerWidth) {
        let out = []
        for (let i = 0; i < 2; i++) {
            let line = {
                type: 'line',
                x0: mouseMovePositions[i],
                y0: 0,
                x1: mouseMovePositions[i],
                y1: 2,
                xref: 'x',
                yref: 'y',
                line: {
                    color: mouseMoveColors[i],
                    width: nanMarkerWidth,
                }
            }
            out.push(line)
        }

        for (let i = 2; i < 4; i++) {
            let line = {
                type: 'line',

                x0: 0,
                y0: mouseMovePositions[i],
                x1: 2,
                y1: mouseMovePositions[i],
                xref: 'x4',
                yref: 'y4',
                line: {
                    color: mouseMoveColors[i],
                    width: nanMarkerWidth,
                }
            }
            out.push(line)
        }

        let top_nan_box = {
            type: 'rect',
            x0: mouseMovePositions[0],
            y0: 0,
            x1: mouseMovePositions[1],
            y1: 2,
            xref: 'x',
            yref: 'y',
            opacity: 0.2,
            fillcolor: "rgba(0, 0, 0, .5)",
            line: {
                width: 0
            }
        }
        out.push(top_nan_box)

        let right_nan_box = {
            type: 'rect',
            x0: 0,
            y0: mouseMovePositions[2],
            x1: 2,
            y1: mouseMovePositions[3],
            xref: 'x4',
            yref: 'y4',
            opacity: 0.2,
            fillcolor: "rgba(0, 0, 0, .5)",
            line: {
                width: 0
            }
        }
        out.push(right_nan_box)

        return out
    }


    finishDrawing() {
        // Get the path.
        const xAxis = this.props.state.xAxis
        const yAxis = this.props.state.yAxis
        const graphJson = this.props.state.graphJson


        // If the user still has a path active, just close that.
        const polys = this.state.drawingPolygons
        let polygons = []
        if (polys == null || polys.length < 1) {
            // No polygon data
        } else {
            const numShapes = polys.length
            if (this.state.drawingPolygons[numShapes - 1].hasPoints()) {
                // Polygon is not closed yet.
                this.endPolygon()
                return
            }

            // Handle multiple polygons as OR.
            for (let poly of polys) {
                if (poly.hasPoints()) {
                    polygons.push(poly.getPoints())
                }
            }

            // Delete any user-drawn shapes
            graphJson.layout.shapes = this.filterShapes(graphJson.layout.shapes, false)
        }

        // Check for third variable changes
        let thirdVarChange = false
        if (this.props.state.zAxis && this.props.state.zAxis != ''
            && (this.state.colorSliderValuesFinal && Array.isArray(this.state.colorSliderValuesFinal) && this.state.colorSliderValuesFinal.length == 2
                && this.state.colorSliderValuesFinal[0] != this.state.colorSliderMin || this.state.colorSliderValuesFinal[1] != this.state.colorSliderMax)) {
            thirdVarChange = true
        }

        if (polygons.length < 1 && !thirdVarChange) {
            console.log('select data with nothing happening.')
            return
        }

        this.props.setPlotState({
            dragmode: 'pan',
            graphJson: graphJson,
            updatePending: true,
        });

        this.setState({
            drawingPolygons: [],
            isSelectingData: false,
        })

        let nanSelection = null
        if (nanPlotsShown(graphJson.layout)) {
            // Get NaN bounds data.
            nanSelection = this.currentNanPositions
        }

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                polygons: polygons,
                subset_ids: getSubsetIds(this.props.state.subsetsSelected),
                colx: xAxis,
                coly: yAxis,
                colz: this.props.state.zAxis,
                plot_type: this.props.state.plotType,
                nanSelection: nanSelection,
                bothNanSelected: this.bothNanChecked,
                colorSliderValuesFinal: this.state.colorSliderValuesFinal,
            })
        }

        // This is a new subset that we don't have a name for yet.  Let's try to figure out
        // a nice name for it.
        // We can base this on the subsets plotted on the graph
        // If there's only one, then we can do simple things.
        let new_subset_name = null
        if (this.props.state.subsetsSelected.length == 1) {
            const sub_id = getSubsetIds(this.props.state.subsetsSelected)[0]
            const sub_name = this.props.subsets[sub_id]['name']

            if (sub_id != 0) {
                if (!sub_name.includes('subset')) {
                    new_subset_name = makeNameUnique(this.props.subsets, this.props.subsets[sub_id]['name'] + "_subset", false, this.props.subsets[sub_id]['name'] + "_subset1")
                } else {
                    new_subset_name = makeNameUnique(this.props.subsets, this.props.subsets[sub_id]['name'] + "_", false, this.props.subsets[sub_id]['name'] + "_1")
                }
            }
        } else if (this.props.state.subsetsSelected.length == 2) {
            // Two subsets selected
            const sub_ids = getSubsetIds(this.props.state.subsetsSelected)
            const sub_name1 = this.props.subsets[sub_ids[0]]['name']
            const sub_name2 = this.props.subsets[sub_ids[1]]['name']

            if (sub_name2.includes("subset")) {
                new_subset_name = makeNameUnique(this.props.subsets, sub_name2 + '-' + sub_name1 + "_", false, sub_name2 + '-' + sub_name1 + "_1")
            } else if (sub_name1.includes("subset")) {
                new_subset_name = makeNameUnique(this.props.subsets, sub_name1 + '-' + sub_name2 + "_", false, sub_name1 + '-' + sub_name2 + "_1")
            } else {
                new_subset_name = makeNameUnique(this.props.subsets, sub_name1 + '-' + sub_name2 + "_subset", false, sub_name1 + '-' + sub_name2 + "_subset1")
            }
        }

        fetch("api/" + this.props.dataId + "/select_data", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.toastError(result['error'])
                        return
                    }
                    // Result is an array, [0] = new ID, [1] = subset list.
                    let subset_id = result[0]
                    let subset_list = result[1]
                    this.props.setSubsets(subset_list, false, new_subset_name)

                    // Change the plot to this subset.
                    this.getPlot(this.props.state.xAxis, this.props.state.yAxis, this.props.state.lastRanges, [{ value: subset_id }], null, null, null, this.props.calculateCorrelations)

                }
            )
    }

    enableZoomBox() {
        this.props.setPlotState({
            dragmode: 'zoom'
        })
    }

    toggleAxis1to1() {
        this.props.setPlotState({
            axisRatioUnlocked: !this.props.state.axisRatioUnlocked
        })
    }

    setScatter() {
        this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, 'scatter')
    }

    setHistogram() {
        let xvar = this.props.state.xAxis
        if (this.props.state.xAxis == null && this.props.state.yAxis != null) {
            xvar = this.props.state.yAxis
        }
        this.getPlot(xvar, null, null, null, 'histogram', null, false, null, null, '')
    }

    setRankPlot() {
        let yvar = this.props.state.yAxis
        if (this.props.state.yAxis == null && this.props.state.xAxis != null) {
            yvar = this.props.state.xAxis
        }
        this.getPlot(null, yvar, null, null, 'rank')
    }

    setNBins(e) {
        if (e.target.value != this.props.state.nBins) {
            this.props.setPlotState({
                nBins: parseFloat(e.target.value),
            })
            this.getPlot(this.props.state.xAxis, this.props.state.yAxis)
        }
    }

    handleShowNansClicked(e) {
        this.cancelDataSelection()
        let nansRequest = ''
        if (nanPlotsShown(this.props.state.graphJson.layout)) {
            nansRequest = 'hide'
        } else {
            nansRequest = 'show'
        }
        this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, null, nansRequest)

        this.props.setPlotState({
            nansRequest: nansRequest,
        })
    }

    handleXaxisLog(e) {
        let unlocked = this.props.state.axisRatioUnlocked
        if (e.target.checked != this.props.state.yAxisLog) {
            unlocked = true
        }
        this.props.setPlotState({
            xAxisLog: e.target.checked,
            axisRatioUnlocked: unlocked,
        })

        this.doAutozoom()

        if (this.props.state.plotType == 'rank' && this.props.state.isHeatmap) {
            // Immediately request a new plot.
            this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, null, null, true) // forceAutozoom = true
        }
    }

    handleYaxisLog(e) {
        let unlocked = this.props.state.axisRatioUnlocked
        if (e.target.checked != this.props.state.xAxisLog) {
            unlocked = true
        }
        this.props.setPlotState({
            yAxisLog: e.target.checked,
            axisRatioUnlocked: unlocked,
        })

        this.doAutozoom()
    }

    handleSubsetClicked(subset_options, action) {
        // Determine what changed.
        let set1 = new Set(this.props.state.subsetsSelected.map(obj => obj.value));
        let set2 = new Set(subset_options.map(obj => obj.value));

        // Find differences from array1 to array2
        let diff1to2 = [...set1].filter(x => !set2.has(x));
        // Find differences from array2 to array1
        let diff2to1 = [...set2].filter(x => !set1.has(x));

        // Combine the differences
        let diff = [...diff1to2, ...diff2to1];

        if (diff.length == 1) {

            if (this.props.shiftPressed) {
                if (this.state.lastSelectForShiftSelect != null) {
                    // This is a mutli-select

                    // Find all the elements between lastSelectForShiftSelect and diff.
                    const subsetRows = this.getSubsetRows()

                    // We need to find the array indexes for the two items.
                    let startIdx = subsetRows.findIndex(item => item.value === this.state.lastSelectForShiftSelect)
                    let endIdx = subsetRows.findIndex(item => item.value === diff[0])

                    if (startIdx >= 0 && endIdx >= 0) {
                        // Found a start and an end.
                        if (startIdx > endIdx) {
                            const temp = endIdx
                            endIdx = startIdx
                            startIdx = temp
                        }

                        // Select all of them by adding them all to subset_options.  We'll sort them later.
                        for (let i = startIdx; i < endIdx; i++) {
                            // Don't add if already there.
                            if (subset_options.findIndex(item => item.value == subsetRows[i].value) == -1) {
                                subset_options.push(subsetRows[i])
                            }
                        }
                    }
                }
            }
            this.setState({
                lastSelectForShiftSelect: diff[0],
            })

        }
        this.props.setPlotState({
            subsetsSelected: sortSelectedOptions(subset_options, this.props.subsetOrder),
        })
    }

    getNumberSubsetsSelected() {
        if (!this.props.state.subsetsSelected) {
            return 0
        } else if (Array.isArray(this.props.state.subsetsSelected)) {
            return this.props.state.subsetsSelected.length
        } else {
            return 1
        }
    }

    handlePlotSubsetChanged() {
        // First, compare the plot's current subsets to what the user is requesting.
        if (!this.props.state.plotSubsetIds || !numericArraysEqual(this.props.state.plotSubsetIds, getSubsetIds(this.props.state.subsetsSelected))) {
            // The user has requested something different, we need to get a new plot.
            this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, null, null, false, this.props.calculateCorrelations)
        }
    }

    setHistType(type) {
        if (this.props.state.histType == type) {
            return
        }
        this.props.setPlotState({
            histType: type,
        })
        this.getPlot(this.props.state.xAxis, this.props.state.yAxis, null, null, null, null, true, null, type)
    }

    getSubsetRows() {
        let subsetRows = []
        if (this.props.subsets != null) {
            if (this.props.subsetOrder && this.props.subsetOrder.length == Object.entries(this.props.subsets).length) {
                for (let sub_idx of this.props.subsetOrder) {
                    if (sub_idx in this.props.subsets) { // sometimes subsetOrder isn't updated after a subset gets deleted
                        subsetRows.push(
                            subsetSelectedEntryFromSubset(this.props.subsets, this.props.subsets[sub_idx])
                        )
                    }
                }
            } else {
                for (let [id, sub] of Object.entries(this.props.subsets)) {
                    subsetRows.push(
                        subsetSelectedEntryFromSubset(this.props.subsets, sub)
                    )
                }
            }
        }
        return subsetRows
    }

    render() {
        const lastRanges = this.props.state['lastRanges'];
        const updatePending = this.props.state['updatePending'];
        const isSelectingData = this.state.isSelectingData;
        const selectingDataDisp = isSelectingData ? '' : 'none';
        const notSelectingDataDisp = !isSelectingData ? '' : 'none';
        const selectDataText = isSelectingData ? 'Selecting data...' : 'Draw new subset';
        const histDisp = this.props.state.plotType == 'histogram' ? 'inline-block' : 'none';
        const scatterDisp = this.props.state.plotType != 'histogram' ? '' : 'none';

        const selectDataVariant = isSelectingData ? 'outline-secondary' : 'outline-primary';
        const loadingDisp = updatePending ? '' : 'none';
        const helpDisplay = this.props.isFirstPlot && this.props.state.xAxis == null && this.props.state.yAxis == null ? '' : 'none';
        const captureMouseDisplay = this.state.captureMouseMove ? '' : 'none';

        let nanPlotShownDisp = 'none';
        let nanPlotShownDisp2 = 'none';
        let nanPlotShownNotDisp = '';

        let nansButtonVariant = 'outline-primary';
        let nansButtonTooltip = 'Show NaN plots';

        let nansButtonHighlighted = false;
        let correlationInfo = [];
        if (this.props.state.plotType === 'scatter') {
            const correlations = this.props.state.correlations;
            const correlationFormatting = { flex: '0 0 auto', margin: '5px', textAlign: "center" };
            let updating = this.props.state.corrUpdatePending;
            if (correlations && Object.keys(correlations).length !== 0) {
                Object.keys(correlations).forEach((method) => {
                    const methodFormatted = method.charAt(0).toUpperCase() + method.slice(1);
                    correlationInfo.push(
                        <OverlayTrigger key={method} placement={'left'}
                            overlay={
                                <Tooltip id="tooltip-edit">
                                    <div style={correlationFormatting}>{methodFormatted} Correlation</div>
                                    <div style={{ ...correlationFormatting, fontSize: '14px', fontFamily: '"Courier New", monospace' }}>R<sup>2</sup>: {updating ? '-.---' : correlations[method][1].toFixed(3)}</div>

                                </Tooltip>
                            }
                        >
                            <div style={{ ...correlationFormatting, fontSize: '12px', fontFamily: '"Courier New", monospace' }}>
                                {method.charAt(0).toUpperCase()}: {updating ? '-.---' : correlations[method][0].toFixed(3)}
                            </div>
                        </OverlayTrigger>

                    );
                });
            }
        }

        let {graphJson, reordered_data, layout} = prepPlot(this.props.state['graphJson'], this.props.state, this.props.subsets, this.props.restrictZoomX, this.props.restrictZoomY, this.props.subsetOrder, this.props.state.plotSubsetIds)

        if (lastRanges != null) {
            nanPlotShownDisp = nanPlotsShown(layout) ? 'inline-flex' : 'none'
            nanPlotShownDisp2 = nanPlotsShown(layout) ? '' : 'none'
            nanPlotShownNotDisp = nanPlotsShown(layout) ? 'none' : ''
        }

        // Disable hovering when the user is selecting data (the box gets in the way).
        if (isSelectingData) {
            layout.hovermode = false
        }

        let axis1to1Lock = ''
        let axis1to1Help = ''
        if (!this.props.state.axisRatioUnlocked) {
            axis1to1Lock = 'fas fa-lock'
            axis1to1Help = 'Unlock 1:1 aspect ratio'
        } else {
            axis1to1Lock = 'fas fa-lock-open'
            axis1to1Help = 'Lock to 1:1 aspect ratio'
        }
        let axis1to1Disabled = this.props.state.xAxisLog != this.props.state.yAxisLog
        if (axis1to1Disabled) {
            axis1to1Help = 'Mix of log/linear axes: Cannot lock 1:1'
        }

        if (this.props.state.nansRequest == 'hide') {
            nansButtonHighlighted = false
        } else if (this.props.state.nansRequest == 'show') {
            nansButtonHighlighted = true
        } else if (nanPlotsShown(layout)) { // auto mode
            nansButtonHighlighted = true
        } else {
            nansButtonHighlighted = false
        }
    
        if (!nansButtonHighlighted) {
            nansButtonTooltip = 'Show NaN plots'
        } else {
            nansButtonTooltip = 'Hide NaN plots'
        }

        let subsetRows = this.getSubsetRows()

    let cursor = isSelectingData ? 'crosshair' : 'move'

    const scatterActive = this.props.state.plotType == 'scatter' ? 'active' : ''
    const histogramActive = this.props.state.plotType == 'histogram' ? 'active' : ''
    const rankActive = this.props.state.plotType == 'rank' ? 'active' : ''

    const scatterActiveDisp = this.props.state.plotType == 'scatter' ? '' : 'none'

    const SingleValue = ({ children, ...props }) => (
        <components.SingleValue {...props}><div className={'valueHolder'}>{children}</div></components.SingleValue>
    );

    const MultiValue = ({ children, ...props }) => (
        <components.MultiValue {...props}><div className={'valueHolder'}>{children}</div></components.MultiValue>
    );
    const dot = (color, isDisabled, isFocused, isSelected) => ({
        alignItems: 'center',
        display: 'flex',

        ':before': {
            backgroundColor: color,
            borderColor: 'white',
            borderRadius: 10,
            borderWidth: isSelected ? '2px' : '0px',
            borderStyle: 'solid',
            content: '" "',
            display: 'block',
            marginRight: 8,
            height: 15,
            width: 15,
        },
    });


    const selectStyles = {
        container: (css) => ({
            ...css,
            marginLeft: "5px",
        }),
        singleValue: (styles, { data }) => {
            const color = chromaNoException(getMarkerColor(this.props.subsets, data.value));
            return {
                ...styles,
                color: color.alpha(1).css(),
            };
        },
        multiValue: (styles, { data }) => {
            const color = chromaNoException(getMarkerColor(this.props.subsets, data.value));
            return {
                ...styles,
                color: 'black',
                backgroundColor: color.alpha(0.4).css(),
            };
        },
        option: (styles, { data, isDisabled, isFocused, isSelected }) => {
            return {
                ...styles,
                ...dot(getMarkerColor(this.props.subsets, data.value), isDisabled, isFocused, isSelected),
            };
        },
        multiValueLabel: (styles, { data }) => {
            const color = chromaNoException(getMarkerColor(this.props.subsets, data.value));
            return {
                ...styles,
                color: color,
            };
        },
        multiValueRemove: (styles, { data }) => ({
            ...styles,
            color: data.color,
            ':hover': {
                backgroundColor: getMarkerColor(this.props.subsets, data.value),
                color: 'white',
            },
        }),
    };

    let histType = 'count'
    if (this.props.state.histType) {
        histType = this.props.state.histType
    }

    const nBinsDefault = this.props.state.nBins ? this.props.state.nBins : 50

    let cmin = 0
    let cmax = 1
    if (this.props.state.minmaxRanges && 'cmin' in this.props.state.minmaxRanges && 'cmax' in this.props.state.minmaxRanges) {
        cmin = this.props.state.minmaxRanges['cmin']
        cmax = this.props.state.minmaxRanges['cmax']
    }

        // console.log(this.props.plotKey)
        // console.log(reordered_data)
        // console.log(layout)

        let zDropAreaRightPx = '85px';
        if (this.props.state.plotType == 'rank' || this.props.state.plotType == 'histogram') {
            zDropAreaRightPx = '60px';
        }

        return (
            // <VisibilitySensor
            //     partialVisibility
            //     onChange={(isVisible) => {
            //         this.setState({isVisible: isVisible})
            //     }}
            // >
            <InView as="div" onChange={(inView, entry) => {
                this.setState({ isVisible: inView })
            }}>
                <div>
                    <div style={{ position: "relative", marginLeft: '40px', marginRight: '5px' }} >
                        <hr />
                        <Form.Control
                            style={{ fontSize: 'large', fontFamily: 'monospace', marginBottom: '5px' }}
                            defaultValue={this.getTitle()}
                            onBlur={(e) => {
                                this.props.setPlotState({ 'title': e.target.value })
                            }}
                            onKeyUp={(e) => {
                                if (e.key === 'Enter') {
                                    this.props.setPlotState({ 'title': e.target.value })
                                }
                            }}
                            onChange={(e) => {
                                // Set a timeout in 1.0 seconds to save if there haven't been any additional
                                // change events.
                                if (this.plotTitleTimeout != null) {
                                    clearTimeout(this.plotTitleTimeout)
                                }
                                this.plotTitleTimeout = setTimeout(() => {
                                    this.props.setPlotState({ 'title': e.target.value })
                                }, 1000)
                            }}
                            onFocus={(e) => { e.target.select() }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div ref={this.selectDivRef} style={{ minWidth: '45%' }}>
                                <Select
                                    isMulti={true}
                                    options={subsetRows}
                                    value={this.props.state.subsetsSelected}
                                    // menuIsOpen={this.state.subsetsMenuIsOpen}
                                    onMenuOpen={() => { this.setState({ isDropdownOpen: true, lastSelectForShiftSelect: null }) }}
                                    onMenuClose={() => { this.setState({ isDropdownOpen: false }) }}
                                    hideSelectedOptions={false}
                                    isClearable={true}
                                    backspaceRemovesValue={false}
                                    components={{ SingleValue, MultiValue }}
                                    placeholder={'Type to search for subsets...'}
                                    closeMenuOnSelect={!(this.props.shiftPressed || this.props.controlPressed)}
                                    //blurInputOnSelect={true}
                                    ref={node => (this.selectItem = node)}
                                    onChange={(selectedOptions, action) => {
                                        this.handleSubsetClicked(selectedOptions, action)
                                        this.handlePlotSubsetChanged()
                                    }}
                                    styles={selectStyles}
                                    className={'plotGroupSelect'}

                                />
                                <Overlay
                                    show={this.state.isDropdownOpen}
                                    target={this.selectDivRef.current}
                                    placement="top"
                                    containerPadding={20}
                                >
                                    <Tooltip id="select-tooltip">
                                        Type to search<br />
                                        Hold shift or ctrl/cmd for multi-select
                                    </Tooltip>
                                </Overlay></div>

                            {!(this.props.state.plotType == 'histogram') ?
                                <Button
                                    variant={selectDataVariant}
                                    style={{ flex: '0 0 auto', margin: '5px', marginLeft: '15`px', display: scatterDisp }}
                                    onClick={this.selectData}>
                                    {selectDataText}
                                </Button>

                                : ''}
                            <div style={{ display: histDisp, marginLeft: '10px' }}>
                                n-bins: <Form.Control type="number" step="10" style={{ width: '5em', display: 'inline-block', border: '1px solid #0d6efd', textAlign: 'center' }} defaultValue={nBinsDefault} onBlur={this.setNBins} onKeyUp={(e) => {
                                    if (e.key === 'Enter') {
                                        this.setNBins(e)
                                    }
                                }}
                                    onChange={(e) => {
                                        // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                        // change events.
                                        if (this.nBinsTimeout != null) {
                                            clearTimeout(this.nBinsTimeout)
                                        }
                                        this.nBinsTimeout = setTimeout(() => {
                                            this.setNBins(e)
                                        }, 1000)
                                    }}
                                />
                            </div>
                            <div style={{ display: histDisp, marginLeft: '10px' }}>
                                <ButtonGroup>
                                    <ToggleButton
                                        variant={histType == 'count' ? 'primary' : 'outline-primary'}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                        onClick={(e) => this.setHistType('count')}
                                    >Count
                                    </ToggleButton>
                                    <ToggleButton
                                        variant={histType == 'proportion' ? 'primary' : 'outline-primary'}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                        onClick={(e) => this.setHistType('proportion')}
                                    >Proportion
                                    </ToggleButton>
                                </ButtonGroup>
                            </div>
                            {(isSelectingData) ?
                                <>
                                    <Button
                                        variant="outline-success"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.finishDrawing}>

                                        <i className="fas fa-check"></i>
                                    </Button>
                                    <Button
                                        variant="outline-danger"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.cancelDataSelection}>

                                        <i className="fas fa-times"></i>
                                    </Button>
                                </>
                                : ''}


                            {/* </Dropdown> */}

                            <div style={{ flex: '1 1 auto', textAlign: 'right' }}>
                            <OverlayTrigger key={'screenshot'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit" style={{}}>
                                            Export to .png / .svg
                                        </Tooltip>
                                    }
                                >
                                    <Button
                                        variant="outline-secondary"
                                        onClick={() => this.props.openScreenshotDialog()}
                                        // disabled={updatePending}
                                    ><i className='fas fa-file-download'></i></Button>
                            </OverlayTrigger>

                                <OverlayTrigger key={'zoom'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit" style={{}}>
                                            Zoom (draw box)
                                            <hr />
                                            <div style={{ textAlign: 'left' }}>
                                                <p><strong>Zoom Hotkeys</strong></p>
                                                <strong>Shift + drag</strong>:<ul><li>Draw zoom box</li></ul>
                                                <strong>Option + scroll</strong>:<ul><li>Zoom X-axis</li></ul>
                                                <strong>Command + scroll</strong>:<ul><li>Zoom Y-axis</li></ul>
                                            </div>
                                        </Tooltip>
                                    }
                                >
                                    <Button
                                        variant="outline-secondary"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.enableZoomBox}>
                                        <i className="fas fa-search-plus"></i>
                                    </Button>
                                </OverlayTrigger>
                                <OverlayTrigger key={'1to1'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit">
                                            {axis1to1Help}
                                        </Tooltip>
                                    }
                                >
                                    <span><Button
                                        variant="outline-secondary"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.toggleAxis1to1}
                                        disabled={axis1to1Disabled}>
                                        <i className={axis1to1Lock} ></i> 1:1
                                    </Button></span>
                                </OverlayTrigger>
                                <OverlayTrigger key={'resetZoom'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit">
                                            Autoscale<br />shortcut: double click graph
                                        </Tooltip>
                                    }
                                >
                                    <Button
                                        variant="outline-secondary"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.doAutozoom}>
                                        <i className="fas fa-compress-arrows-alt"></i>
                                    </Button>
                                </OverlayTrigger>
                                <OverlayTrigger key={'duplicatePlot'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit">
                                            Duplicate plot
                                        </Tooltip>
                                    }
                                >
                                    <Button
                                        variant="outline-secondary"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.props.duplicatePlot}>
                                        <i className="fas fa-clone"></i>
                                    </Button>
                                </OverlayTrigger>

                                <OverlayTrigger key={'deletePlot'} placement={'bottom'}
                                    overlay={
                                        <Tooltip id="tooltip-edit">
                                            Delete plot
                                        </Tooltip>
                                    }
                                >
                                    <Button
                                        variant="outline-secondary"
                                        style={{ flex: '0 0 auto', margin: '5px' }}
                                        onClick={this.props.deletePlot}>
                                        <i className="fas fa-trash"></i>
                                    </Button>
                                </OverlayTrigger>
                            </div>
                        </div>
                        <div style={{ flexDirection: 'row', display: 'grid', gridTemplateColumns: 'auto min-content', position: 'relative' }}>
                            <div
                                onMouseMove={this.handleMouseMove}
                                onClick={this.handleGraphClick}
                                onContextMenu={this.handleGraphRightClick}
                                style={{ cursor: cursor }}
                                ref={this.doSafariScrollFix}
                            >
                                <Plot
                                    name="plot1"
                                    data={reordered_data}
                                    layout={layout}
                                    divId={'plotDivId' + this.props.plotKey}
                                    config={{
                                        scrollZoom: true,
                                        displaylogo: false,
                                        responsive: true,
                                        displayModeBar: false,
                                        doubleClick: 'false',
                                    }}
                                    style={{ height: "75vh" }}
                                    onRelayout={this.handlePanZoom}
                                    onDoubleClick={this.handleDoubleClick}
                                />
                            </div>
                            <img src="help_starter.svg" style={{ display: helpDisplay, position: "absolute", top: '70px', left: '80px', width: '90%', height: '100%', paddingLeft: '0px', paddingBottom: '150px', paddingRight: '10px', objectFit: 'scale-down' }} />

                            {/* This is a hack to work around the fact that Plotly doesn't allow us to capture mouse-drag events.  When the user is hovering over the NaN bar, we show this display on top of everything to get the mouse events. */}
                            <div onMouseMove={this.handleMouseMove} onMouseUp={this.handleMouseMove} style={{ display: captureMouseDisplay, position: "absolute", top: '0px', left: '0px', width: '100%', height: '100%', paddingLeft: '0px', paddingBottom: '0px', paddingRight: '0px', objectFit: 'scale-down', cursor: 'grab', border: '0px solid black' }} />

                            <div style={{ position: "absolute", bottom: "90px", left: "-20px", transform: 'rotate(-90deg)', border: '0px solid black' }}>
                                <AxisLogSwitch onChange={this.handleYaxisLog} default={this.props.state.yAxisLog} />
                            </div>

                            <div style={{ position: "absolute", bottom: "0px", left: "50px", border: '0px solid black' }}>
                                <AxisLogSwitch onChange={this.handleXaxisLog} default={this.props.state.xAxisLog} />
                            </div>

                            {/* layout.margin = {l: '50', r: '50', b: '50', t: '20', pad: '4'} */}
                            <DropArea name='yaxis' onDrop={this.dropPlotY} writingMode='vertical-rl' transform='rotate(180deg)' text='Drop a variable' divStyle={{ position: "absolute", top: "0px", height: "108%", width: "80px", paddingBottom: "135px" }} show={true} />

                            <DropArea name='xaxis' onDrop={this.dropPlotX} writingMode="horizontal-tb" text='Drop a variable' divStyle={{ position: "absolute", bottom: "-10px", left: "0px", height: "80px", width: "85%", paddingLeft: "80px" }} show={true} />

                            {/* <DropArea name='zaxis' onDrop={this.dropPlotZ} writingMode="horizontal-tb" text={<>Drop a variable<br />(for color)</>} divStyle={{ position: "absolute", top: "20px", right: "100px", height: "30%", width: "30%", paddingLeft: "80px" }}/> */}

                            <DropArea name='zaxis' onDrop={this.dropPlotZ} writingMode='vertical-lr' text={<>(for color)<br />Drop a variable</>} divStyle={{ position: "absolute", top: "0px", right: zDropAreaRightPx, height: "105%", width: "150px", paddingBottom: "135px" }} show={this.props.state.plotType != 'histogram'} />




                            <div style={{ position: "absolute", textAlign: "center", verticalAlign: 'middle', top: "0px", right: "100px", height: "13%", width: "13%", paddingRight: "10px", display: nanPlotShownDisp }}>
                                <div style={{ margin: 'auto' }}>
                                    <span style={{ display: notSelectingDataDisp }}>
                                        <OverlayTrigger key={'both_nan'} placement={'bottom'}
                                            overlay={
                                                <Tooltip id="tooltip-edit">
                                                    {this.props.state.bothNan.toLocaleString()}
                                                </Tooltip>
                                            }
                                        ><span>
                                                <span style={{ fontVariant: 'small-caps', fontSize: 'small' }}>Both NaN:<br /></span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{nFormatter(this.props.state.bothNan)}</span>
                                            </span></OverlayTrigger>
                                    </span>
                                    <Form.Check
                                        style={{ display: selectingDataDisp }}
                                        type="checkbox"
                                        id={this.props.state.key + "include_both_nans"}
                                        label={<span><span style={{ fontVariant: 'small-caps', fontSize: 'small' }}>Both NaN:<br /></span><span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{nFormatter(this.props.state.bothNan)}</span></span>}
                                        onChange={(e) => this.bothNanChecked = e.target.checked}
                                    />
                                </div>
                            </div>

                            <Spinner animation="border" variant="secondary" style={{ display: loadingDisp, position: "absolute", top: '50%', left: '50%' }} />

                            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'start', marginTop: '20px', marginLeft: '10px' }}>
                                <ColorBarLegend
                                    graphJson={graphJson}
                                    zAxis={this.props.state.zAxis}
                                    clearZAxis={this.clearZAxis}
                                    flipColorScale={this.flipColorScale}
                                    setColorScale={this.setColorScale}
                                    colorscale={this.props.state.colorscale}
                                    plotDims={this.getPlotWidthHeightPx()}
                                    colorSliderValues={this.state.colorSliderValues}
                                    onColorSliderChange={this.onColorSliderChange}
                                    onColorSliderFinalChange={this.onColorSliderFinalChange}
                                    cmin={this.state.colorSliderMin}
                                    cmax={this.state.colorSliderMax}
                                    isSelectingData={this.state.isSelectingData}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'start' }}>
                                    <OverlayTrigger key={'scatter'} placement={'left'}
                                        overlay={
                                            <Tooltip id="tooltip-edit">
                                                Scatter plot
                                            </Tooltip>
                                        }
                                    >
                                        <Button
                                            variant="outline-primary"
                                            active={scatterActive}
                                            style={{ flex: '0 0 auto', margin: '5px' }}
                                            onClick={this.setScatter}>
                                            <i className="fas fa-braille"></i>
                                        </Button>
                                    </OverlayTrigger>
                                    <OverlayTrigger key={'histogram'} placement={'left'}
                                        overlay={
                                            <Tooltip id="tooltip-edit">
                                                Histogram
                                            </Tooltip>
                                        }
                                    >
                                        <Button
                                            variant="outline-primary"
                                            active={histogramActive}
                                            style={{ flex: '0 0 auto', margin: '5px' }}
                                            onClick={this.setHistogram}>
                                            <i className="fas fa-chart-bar"></i>
                                        </Button>
                                    </OverlayTrigger>

                                    <OverlayTrigger key={'ranked'} placement={'left'}
                                        overlay={
                                            <Tooltip id="tooltip-edit">
                                                Ranked plot
                                            </Tooltip>
                                        }
                                    >
                                        <Button
                                            variant="outline-primary"
                                            style={{ flex: '0 0 auto', margin: '5px' }}
                                            active={rankActive}
                                            onClick={this.setRankPlot}>
                                            <i className="fas fa-sort-amount-down-alt"></i>

                                        </Button>
                                    </OverlayTrigger>

                                    <OverlayTrigger key={'nans'} placement={'left'}
                                        overlay={
                                            <Tooltip id="tooltip-edit">
                                                {nansButtonTooltip}
                                            </Tooltip>
                                        }
                                    >
                                        <Button
                                            variant='outline-primary'
                                            style={{ display: scatterActiveDisp, flex: '0 0 auto', margin: '5px', marginTop: '50px' }}
                                            onClick={this.handleShowNansClicked}>
                                            {<span><span style={{ display: nanPlotShownNotDisp }}>NaNs: {nFormatter(this.props.state.numNans)}</span>
                                                <div style={{ display: nanPlotShownDisp2 }}>
                                                    <table><tbody>
                                                        <tr style={{ borderBottom: '1px solid white' }}><td><div style={{ width: '10px', height: '10px', background: '#C44E52', marginRight: '2px' }}></div></td><td>NaNs: {nFormatter(this.props.state.numNans)}</td></tr>
                                                        <tr><td><div style={{ width: '10px', height: '10px', background: '#808080' }}></div></td><td>All</td></tr>
                                                    </tbody></table>
                                                </div>
                                            </span>}
                                        </Button>
                                    </OverlayTrigger>
                                    {correlationInfo}
                                </div>
                            </div>
                        </div>

                    </div>

                </div>
            </InView>
        );
    }

}

export { PlotGroup };
