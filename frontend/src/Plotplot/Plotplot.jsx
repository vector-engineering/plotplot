import React from 'react';
import { Container, Row, Col, Form, ToastContainer, Toast, Card, Button, DropdownButton, Dropdown, Collapse, Badge } from 'react-bootstrap';
import { DndProvider } from 'react-dnd'
import { Split } from '@geoffcox/react-splitter';
import { HTML5Backend } from 'react-dnd-html5-backend'
import { PlotGroup } from './PlotGroup/PlotGroup';
import { SubsetList } from './SubsetList';
import { MathBox } from './MathBox';
import { ScreenshotDialog } from './ScreenshotDialog';
import { VariableList } from './VariableList/VariableList';
import { CsvExportDialog } from './CsvExportDialog';
import { ReportBugDialog } from './ReportBugDialog';
import FilterDialog from './FilterDialog/FilterDialog';
import { SearchBoxWithClearButton } from './SearchBoxWithClearButton';
import preval from 'preval.macro'
import { saveAs } from 'file-saver';

import { makeNameUnique, generatePlotKey } from '../utility';
import { getSubsetIds, subsetSelectedEntryFromSubset, getDefaultMarkerSize, getDefaultMarkerColor, doPlotColoring, sortSelectedOptions, getSubsetIdsInGraphOrder } from './PlotGroup/PlotGroupUtils'


import '../App.css';

class Plotplot extends React.Component {
    constructor(props) {
        super(props);
        this.state = props.initState || {
            columns: null,
            mathExpanded: false,
            subsets: [],
            scrollIntoViewSubset: null,
            searchString: '',
            errorToast: '',
            plotStates: [],
            scrollAndHighlightVar: null,
            isNewVarList: [],
            showCsvDialog: false,
            nonNumericCols: null,
            exportSubsetId: null,
            savedCsvCheckboxState: null,
            showFilterDialog: false,
            filterDialogJustLoaded: false,
            plotCursorPosX: 0,
            plotCursorPosY: 0,
            hoverlistNumeric: new Set(),
            hoverlistNonNumeric: new Set(),
            subsetOrder: [],
            lastSubsetChange: null, // used just to trigger memoized objects on subset change
            showReportBugDialog: false,
            showScreenshotDialog: false,
            searchFilterSubsets: false,
            screenshotPlot: null,
            colLabels: [],
            screenshotState: undefined,
        };

        if (!this.state.screenshotState) {
            this.state.screenshotState = {
                axisLabelFontSize: 28,
                axisTickFontSize: 20,
                showGridX: true,
                showGridY: true,
                zeroLineX: true,
                zeroLineY: true,
                forcePlotWidth: 0,
                forcePlotHeight: 0,
                exportResolutionMultiplier: 1,
                showLegend: true,
                showSubsetCounts: true,
                legendLocation: "left",
                lastSplitValue: "80%",
                legendMarginTop: 0,
                legendLabelFontSize: 20,
            }
        }
        if (!('showScreenshotDialog' in this.state)) {
            this.state.showScreenshotDialog = false
        }

        if (props.initState) {
            this.state.hoverlistNumeric = new Set(props.initState.hoverlistNumeric)
            this.state.hoverlistNonNumeric = new Set(props.initState.hoverlistNonNumeric)
        }

        if (this.state.subsetOrder === undefined) {
            this.state.subsetOrder = []
        }

        this.initSubsetOrder = JSON.parse(JSON.stringify(this.state.subsetOrder))

        console.log(props.initState)

        this.lastStateJson = ''
        this.stateDirty = false
        this.setSubsets = this.setSubsets.bind(this)
        this.setColumns = this.setColumns.bind(this)
        this.setAllColumns = this.setAllColumns.bind(this)
        this.onSearchChange = this.onSearchChange.bind(this)
        this.toastError = this.toastError.bind(this)
        this.closeToast = this.closeToast.bind(this)
        this.setPlotState = this.setPlotState.bind(this)
        this.setScreenshotState = this.setScreenshotState.bind(this)
        this.initPlotState = this.initPlotState.bind(this)
        this.setState = this.setState.bind(this)
        this.clearScroll = this.clearScroll.bind(this)
        this.maybeSaveState = this.maybeSaveState.bind(this)
        this.downloadCsvDialog = this.downloadCsvDialog.bind(this)
        this.hideCsvDialog = this.hideCsvDialog.bind(this)
        this.saveCsvCheckboxState = this.saveCsvCheckboxState.bind(this)
        this.getSubsetName = this.getSubsetName.bind(this)
        this.filterDialog = this.filterDialog.bind(this)
        this.hideFilterDialog = this.hideFilterDialog.bind(this)
        this.completeFilter = this.completeFilter.bind(this)
        // this.handleMouseCoordTracker = throttle(this.handleMouseCoordTracker.bind(this), 10)
        // this.handleMouseCoordVisibility = throttle(this.handleMouseCoordVisibility.bind(this), 125)
        // this.updatePlotCursor = throttle(this.updatePlotCursor.bind(this), 100)
        this.calculateCorrelations = this.calculateCorrelations.bind(this)
        this.deleteSubset = this.deleteSubset.bind(this)
        this.updateHoverlist = this.updateHoverlist.bind(this)
        this.renameSubset = this.renameSubset.bind(this)
        this.setSubsetOrder = this.setSubsetOrder.bind(this)
        this.downloadBugReportJson = this.downloadBugReportJson.bind(this)
        this.getSaveStateJson = this.getSaveStateJson.bind(this)
        this.handleSearchFilterTypeChange = this.handleSearchFilterTypeChange.bind(this)
        this.updateSubsetOrder = this.updateSubsetOrder.bind(this)

        this.searchBoxRef = React.createRef()
    }

    initPlotState() {
        let state = {
            error: null,
            graphJson: null,
            xAxis: null,
            yAxis: null,
            zAxis: null,
            lastRanges: null,  // last zoom ranges
            validRanges: null, // if we have a bbox, the valid area
            updatePending: false,
            initialRanges: null, // initial view of this plot.
            dragmode: 'pan',
            plotType: '',
            requestNumber: 0,
            requestInFlight: -1,
            key: generatePlotKey(),
            axisRatioUnlocked: false,
            forceUpdateNow: false,
            bothNan: 0,
            plotType: null,
            nBins: 0,
            minmaxRanges: null, // the min and max of the data [(xmin, xmax), (ymin, ymax)]
            nansRequest: null,
            numNans: 0,
            xAxisLog: false,
            yAxisLog: false,
            isHeatmap: false,
            subsetsSelected: Object([]),
            plotSupportsHovering: false,
            histType: 'count',
            hovermode: false,
            colorscale: null,
            colorscaleFlipped: false,
            plotSubsetIds: null,
        }
        let plotStates = this.state.plotStates
        plotStates.push(state)
        this.setState({
            plotStates: plotStates
        })

    }

    setState(state, callback) {
        super.setState(state, callback)
        this.stateDirty = true
    }

    setSubsetOrder(subsetOrder) {
        // React allows you to set state based on the previous state, which is how the DnD example moves things around in its order array.
        // This function determines if that is happening and executes the previous state call if needed.
        // See: https://stackoverflow.com/a/55497074/730138
        if (subsetOrder instanceof Function) {
            this.setState(prevState => ({
                subsetOrder: subsetOrder(prevState.subsetOrder),
            }, this.updateSubsetOrder))
        } else {
            this.setState({
                subsetOrder: subsetOrder,
            }, this.updateSubsetOrder)
        }
    }

    updateSubsetOrder() {
        // This is called after subsetOrder is set in state so we can sort all the subsets in the plot Select bar
        let new_plot_states = [...this.state.plotStates]
        for (let i = 0; i < new_plot_states.length; i++) {
            new_plot_states[i].subsetsSelected = sortSelectedOptions(new_plot_states[i].subsetsSelected, this.state.subsetOrder)
        }

        this.setState({
            plotStates: new_plot_states
        })
    }

    getSaveStateJson() {
        let saveState = {}
        for (let key in this.state) {
            if (!['plotStates', 'plotCursorPosX', 'plotCursorPosY'].includes(key)) {
                saveState[key] = this.state[key]

            }
        }
        // Save the plot states without the data.
        saveState['plotStates'] = []
        for (let i = 0; i < this.state.plotStates.length; i++) {
            saveState['plotStates'][i] = {}
            for (let key in this.state.plotStates[i]) {
                if (key != 'graphJson' && key != 'columns') {
                    saveState['plotStates'][i][key] = this.state['plotStates'][i][key]
                }
            }
            saveState['searchString'] = ''
            saveState['isNewVarList'] = []
            saveState['columns'] = null
            saveState['errorToast'] = ''
            saveState['showCsvDialog'] = false
            saveState['nonNumericCols'] = null
            saveState['exportSubsetId'] = null
            saveState['showFilterDialog'] = false
            saveState['hoverlistNumeric'] = Array.from(this.state.hoverlistNumeric)
            saveState['hoverlistNonNumeric'] = Array.from(this.state.hoverlistNonNumeric)
            saveState['showReportBugDialog'] = false
            saveState['showScreenshotDialog'] = false
            saveState['plotStates'][i]['graphJson'] = null
            saveState['plotStates'][i]['forceUpdateNow'] = false
            saveState['plotStates'][i]['bothNan'] = 0
            saveState['plotStates'][i]['minmaxRanges'] = null
            saveState['plotStates'][i]['numNans'] = 0
            saveState['plotStates'][i]['plotSubsetIds'] = null

        }
        return JSON.stringify({ 'json_state': JSON.stringify(saveState) })
    }

    maybeSaveState() {
        if (!this.stateDirty) {
            return
        }
        this.stateDirty = false

        const stateJson = this.getSaveStateJson()

        if (stateJson === this.lastStateJson) {
            return
        }

        this.lastStateJson = stateJson

        // Send state to the server so it can backup our session for us.
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: stateJson
        }

        fetch("api/" + this.props.dataId + "/save_state", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    // if ('error' in result) {
                    //     this.toastError(result['error'])
                    //     return
                    // }
                }
            )
    }

    saveCsvCheckboxState(nonNumericCheckboxState, numericCheckboxState) {
        let s = {}
        s['nonNumericCheckboxState'] = nonNumericCheckboxState
        s['numericCheckboxState'] = numericCheckboxState
        this.setState({
            savedCsvCheckboxState: s
        })
    }

    downloadCsvDialog(subset_id) {
        this.setState({
            showCsvDialog: true,
            exportSubsetId: subset_id,
        })
    }

    hideCsvDialog() {
        this.setState({
            showCsvDialog: false
        })
    }

    hideFilterDialog(deleteFilterIdBecauseCancelled) {
        if (deleteFilterIdBecauseCancelled !== null) {
            this.deleteSubset(deleteFilterIdBecauseCancelled)
        }

        this.setState({
            showFilterDialog: false
        })
    }

    setPlotState(plotId, s, callback) {
        let plotStates = this.state.plotStates;
        Object.assign(plotStates[plotId], s);
        this.setState({
            plotStates: plotStates,
        }, () => {
            if (callback) {
                callback()
            }
        });
    }

    setScreenshotState(s, callback) {
        Object.assign(this.state.screenshotState, s);
        this.setState({
            screenshotState: this.state.screenshotState
        }, () => {
            if (callback) {
                callback()
            }
        });
    }

    calculateCorrelations(plotId) {
        const dont_compute_if_above = 1000000
        let request_vals = {}
        let plotStates = this.state.plotStates;
        request_vals['x'] = plotStates[plotId].xAxis;
        request_vals['y'] = plotStates[plotId].yAxis;
        request_vals['subset_ids'] = getSubsetIds(plotStates[plotId].subsetsSelected);

        // If any subset is huge, calculating the correlation will take a long time and we don't want to do it.
        for (let id of request_vals['subset_ids']) {
            if (this.state.subsets[id]['count'] > 1000000) {
                console.log('Not computing correlations because plot is large.')
                return
            }
        }

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request_vals)
        }

        fetch("api/" + this.props.dataId + "/calc_r", requestOptions)
            .then(res => res.json())
            .then((result) => {
                if ('error' in result) {
                    this.toastError(result['error']);
                    return;
                }
                Object.assign(plotStates[plotId], { correlations: result, corrUpdatePending: false });
                this.setState({
                    plotStates: plotStates
                });
            });
    }

    setAllColumns(numeric, non_numeric, col_labels) {
        this.setState({
            columns: numeric,
            nonNumericCols: non_numeric,
            colLabels: col_labels,
        })
    }

    setColumns(numeric_columns, col_labels, scrollToVar = null) {
        let isNewVarList = this.state.isNewVarList
        if (scrollToVar != null) {
            isNewVarList.push(scrollToVar)
        }

        console.log(numeric_columns)

        this.setState({
            columns: numeric_columns,
            colLabels: col_labels,
            scrollAndHighlightVar: scrollToVar,
            isNewVarList: isNewVarList,
        })

        // After some time, remove the new variables from the new list
        // so they don't keep getting highlighted.
        setTimeout(() => {
            let varlist = this.state.isNewVarList
            let varlist2 = []
            for (let v of varlist) {
                if (!isNewVarList.includes(v)) {
                    varlist2.push(v)
                }
            }
            this.setState({
                isNewVarList: varlist2
            })
        }, 5000)
    }

    setSubsets(subsets, scrollToNew = false, new_subset_name) {
        let scrollIntoViewSubset = null

        let ids = []
        for (let [id, sub] of Object.entries(subsets)) {
            ids.push(sub['id'])

            // Merge name in
            if ('name' in subsets[id]) {
                // keep the name coming in
            } else if (this.state.subsets && id in this.state.subsets && 'name' in this.state.subsets[id]) {
                subsets[id]['name'] = this.state.subsets[id]['name']
            } else if (id == 0) {
                subsets[id]['name'] = '(all)'
            } else {
                if (new_subset_name != null) {
                    subsets[id]['name'] = new_subset_name
                    new_subset_name = null
                } else {
                    subsets[id]['name'] = makeNameUnique(this.state.subsets, 'subset' + id)
                }
            }

            // Set color
            if (!('color' in subsets[id])) {
                if (this.state.subsets && id in this.state.subsets && 'color' in this.state.subsets[id]) {
                    subsets[id]['color'] = this.state.subsets[id]['color']
                } else {
                    subsets[id]['color'] = getDefaultMarkerColor(id)
                }
            }

            // Set size
            if (!('size' in subsets[id])) {
                if (this.state.subsets && id in this.state.subsets && 'size' in this.state.subsets[id]) {
                    subsets[id]['size'] = this.state.subsets[id]['size']
                } else {
                    subsets[id]['size'] = getDefaultMarkerSize()
                }
            }
        }

        // Check for plots with a deleted subset.
        let plotStates = this.state.plotStates
        for (let i = 0; i < this.state.plotStates.length; i++) { // for each plot
            let new_subsets_selected = []
            if (Array.isArray(this.state.plotStates[i].subsetsSelected)) {
                for (let j = 0; j < this.state.plotStates[i].subsetsSelected.length; j++) {
                    if (ids.includes(this.state.plotStates[i].subsetsSelected[j]['value'])) {
                        new_subsets_selected.push(
                            subsetSelectedEntryFromSubset(subsets, subsets[this.state.plotStates[i].subsetsSelected[j]['value']])) // name could have changed, need to regen
                    } else {
                        // Subset wasn't found, so we need to update the plot.
                        plotStates[i].forceUpdateNow = true
                    }
                }
            } else { // only one entry
                if (ids.includes(this.state.plotStates[i].subsetsSelected['value'])) {
                    new_subsets_selected = subsetSelectedEntryFromSubset(subsets, subsets[this.state.plotStates[i].subsetsSelected['value']]) // name could have changed, need to regen
                } else {
                    // Subset wasn't found, so we need to update the plot.
                    plotStates[i].forceUpdateNow = true
                }
            }
            if (this.state.subsets && 0 in this.state.subsets && Array.isArray(new_subsets_selected) && new_subsets_selected.length < 1) {
                new_subsets_selected = plotStates[i].subsetsSelected = subsetSelectedEntryFromSubset(subsets, this.state.subsets[0])
            }
            plotStates[i].subsetsSelected = new_subsets_selected
        }

        // Update subsetOrder
        let new_subset_order = [...ids]
        const new_subset_order_sorted = new_subset_order.sort((a, b) => {
            const indexA = this.state.subsetOrder.indexOf(a);
            const indexB = this.state.subsetOrder.indexOf(b);

            // If a.id isn't in subsetOrder, place it at the end
            if (indexA === -1 || indexB === -1) {
                return a - b
            }
            // Regular comparison based on subsetOrder
            return indexA - indexB;
        });

        // Update colors and size
        for (let i = 0; i < plotStates.length; i++) { // for each plot
            let graphJson = plotStates[i].graphJson
            let zAxis = plotStates[i].zAxis

            // Only update the coloring if we aren't about to update the plot.  This prevents us from updating a graphJson that is out of sync with subsets/subset_ids
            if (!plotStates[i].forceUpdateNow && graphJson && subsets) {
                const subset_ids = getSubsetIdsInGraphOrder(plotStates[i].subsetsSelected, new_subset_order_sorted)
                graphJson = doPlotColoring(graphJson, subsets, zAxis, subset_ids, plotStates[i].colorscaleFlipped, plotStates[i].colorscale, plotStates[i].minmaxRanges)
                plotStates[i].graphJson = graphJson
            }
        }

        this.setState({
            plotStates: plotStates,
            subsets: subsets,
            lastSubsetChange: Date.now(),
            scrollIntoViewSubset: scrollIntoViewSubset,
            subsetOrder: new_subset_order_sorted,
        })
    }

    renameSubset(id, new_name) {
        let subsets = this.state.subsets
        subsets[id]['name'] = new_name
        this.setSubsets(subsets)
    }

    onSearchChange(text) {
        this.setState({
            searchString: text
        })
    }

    toastError(err) {
        this.setState({
            errorToast: err
        })
    }

    closeToast() {
        this.setState({
            errorToast: ''
        })
    }

    deleteSubset(id) {
        // Tell the backend to delete.
        fetch("api/" + this.props.dataId + "/delete_subset?subset_id=" + id)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.toastError(result['error'])
                        return
                    }

                    this.setSubsets(result, false)
                }
            )
    }

    goBack() {
        this.props.goBack()
    }

    clearScroll() {
        this.setState({
            scrollIntoViewSubset: null,
            scrollAndHighlightVar: null,
        })
    }

    duplicatePlot(num) {
        let plots = this.state.plotStates
        let new_plot = structuredClone(this.state.plotStates[num])
        new_plot.key = generatePlotKey()
        plots.splice(num, 0, new_plot)
        this.setState({
            plotStates: plots,
        })
    }

    deletePlot(num) {
        let plots = this.state.plotStates
        plots.splice(num, 1);
        this.setState({
            plotStates: plots
        })
    }

    downloadBugReportJson() {
        const jsonContent = this.getSaveStateJson()
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });

        const currentDate = new Date();
        const formattedDate = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}_${currentDate.getHours()}-${currentDate.getMinutes()}-${currentDate.getSeconds()}`;



        saveAs(blob, `plotplot-bug-report-${formattedDate}.json`);
    }

    openScreenshotDialog(plot_idx) {
        this.setState({
            screenshotPlot: this.state.plotStates[plot_idx],
            showScreenshotDialog: true,
        })
    }

    componentDidMount() {
        // Every 5 seconds, consider saving state.
        setInterval(this.maybeSaveState, 5000);
        // document.addEventListener("mousemove", this.handleMouseCoordTracker, false);
        // document.addEventListener("mousemove", this.handleMouseCoordVisibility, false);
    }

    componentWillUnmount() {
        // document.removeEventListener("mousemove", this.handleMouseCoordTracker, false);
        // document.removeEventListener("mousemove", this.handleMouseCoordVisibility, false);
    }


    componentDidUpdate() {
        // let s = ''
        // for (let p of this.state.plotStates) {
        //     s += p.key + ' ' 
        // }
        // console.log(s)
        // Always have an extra plot at the bottom
        if (this.state.plotStates.length < 1) {
            this.initPlotState()
        } else {
            const lastPlotState = this.state.plotStates[this.state.plotStates.length - 1]
            if ((lastPlotState.xAxis != null && lastPlotState.xAxis != 'null') ||
                (lastPlotState.yAxis != null && lastPlotState.yAxis != 'null')) {
                this.initPlotState()
            }
        }
    }

    getSubsetName(subset_id, subsets) {
        if (subsets) {
            if (subset_id in subsets) {
                return subsets[subset_id]['name']
            }
        }
        return 'subset'
    }

    filterDialog(col) {
        this.setState({
            filterDialogVar: col,
            filterDialogJustLoaded: true,
            showFilterDialog: true,
        })
    }

    completeFilter(newSubsetId, subsets) {
        this.setSubsets(subsets, true)
    }

    updateHoverlist(column_name, checked, isnumeric) {
        let localHoverlist = null
        if (isnumeric == true) {
            localHoverlist = this.state.hoverlistNumeric
        } else {
            localHoverlist = this.state.hoverlistNonNumeric
        }

        if (!localHoverlist) {
            localHoverlist = new Set()
        }
        localHoverlist = new Set(localHoverlist)
        if (checked == true) {
            localHoverlist.add(column_name)
        } else {
            localHoverlist.delete(column_name)
        }

        if (isnumeric == true) {
            this.setState({
                hoverlistNumeric: new Set(Array.from(localHoverlist).sort(Intl.Collator().compare))
            })
        } else {
            this.setState({
                hoverlistNonNumeric: new Set(Array.from(localHoverlist).sort(Intl.Collator().compare))
            })
        }
        let newPlotstates = this.state.plotStates
        for (let i = 0; i < this.state.plotStates.length; i++) {
            if (this.state.plotStates[i].plotSupportsHovering == true) {
                newPlotstates[i].forceUpdateNow = true
            }
        }
        this.setState({
            plotStates: newPlotstates
        })
    }

    handleSearchFilterTypeChange(e) {
        let out = false
        if (e.target.id == "search-filter-subsets-radio") {
            out = true
        } else {
            out = false
        }
        this.setState({
            searchFilterSubsets: out
        })

        // Focus the search box
        this.searchBoxRef.current.focus()
        this.searchBoxRef.current.select()
    }

    render() {
        const subsets = this.state.subsets
        const mathExpanded = this.state.mathExpanded
        const mathTabDisp = mathExpanded ? 'none' : ''
        const scrollIntoViewSubset = this.state.scrollIntoViewSubset
        const scrollAndHighlightVar = this.state.scrollAndHighlightVar
        const isNewVarList = this.state.isNewVarList
        const errorToast = this.state.errorToast
        const showToast = errorToast.length == 0 ? false : true
        const exportSubsetId = this.state.exportSubsetId

        let allSubsetNames = []
        if (subsets) {
            for (let i = 0; i < subsets.length; i++) {
                allSubsetNames.push(subsets[i]['name']);
            }
        }

        let shareButton = (<>
            <DropdownButton id="share-button" title="Share" align="end">
                <div style={{ display: 'flex' }}>
                    <Dropdown.ItemText><Form.Control id="shareUrl" type="text" value={window.location.href} onClick={(e) => { e.target.select() }} readOnly={true} style={{ minWidth: '200px' }} /></Dropdown.ItemText>
                    <Button style={{ flex: '0 0 auto', marginRight: '10px' }} variant='outline-primary'
                        onClick={(e) => {
                            navigator.clipboard.writeText(window.location.href)
                            e.target.innerHTML = 'Copied!'
                            setTimeout(() => {
                                e.target.innerHTML = 'Copy'
                            }, 1000)
                        }}
                    >Copy</Button>
                </div>
            </DropdownButton></>)
        if (this.props.email == 'user@plotplot.org') {
            shareButton = <></>
        }

        let exportSubsetName = this.getSubsetName(exportSubsetId, subsets)

        let plots = []
        let hoverlist = Array.from(this.state.hoverlistNonNumeric).concat(Array.from(this.state.hoverlistNumeric))
        for (let i = 0; i < this.state.plotStates.length; i++) {
            plots.push(
                <PlotGroup
                    key={this.state.plotStates[i].key}
                    plotKey={this.state.plotStates[i].key}
                    setSubsets={this.setSubsets}
                    subsets={subsets}
                    toastError={this.toastError}
                    dataId={this.props.dataId}
                    setPlotState={(s, callback) => this.setPlotState(i, s, callback)}
                    calculateCorrelations={() => { this.calculateCorrelations(i) }}
                    state={this.state.plotStates[i]}
                    filename={this.props.filename}
                    isFirstPlot={i == 0}
                    duplicatePlot={() => this.duplicatePlot(i)}
                    deletePlot={() => this.deletePlot(i)}
                    // updatePlotCursor={this.updatePlotCursor}
                    // handleMouseCoordVisibility={this.handleMouseCoordVisibility}
                    hoverlist={hoverlist}
                    restrictZoomX={this.props.restrictZoomX}
                    restrictZoomY={this.props.restrictZoomY}
                    subsetOrder={this.state.subsetOrder}
                    shiftPressed={this.props.shiftPressed}
                    controlPressed={this.props.controlPressed}
                    openScreenshotDialog={() => this.openScreenshotDialog(i)}
                />
            )
        }

        document.title = this.props.filename + ' - Plotplot'
        let user_data = <></>
        if (this.props.email != 'user@plotplot.org') {
            user_data = <><img style={{ width: 30, borderRadius: 30, marginRight: '8px', flex: '1 1 auto' }} src={this.props.profilePicture} /> {this.props.name} (<a href="logout">logout</a>)</>
        }
        return (
            // The way the frames are set up is that there's a main div that has 100vh height.  This div never scrolls.
            // Inside of it there is the splitter and then on the left/right there are divs that have 100vh height that scroll.  Those are the 
            // divs that generate the scroll bars.
            <div style={{ height: '100vh' }}>
                {/* <Badge
                    id={"coord-tooltip"}
                    style={{ zIndex: 1000, position: 'absolute', visibility: 'hidden' }}
                >
                    &#40; {this.state.plotCursorPosX.toFixed(2) || 0}, {this.state.plotCursorPosY.toFixed(2) || 0} &#41;
                </Badge> */}

                <DndProvider backend={HTML5Backend}>
                    {/* dispatchEvent causes plotly to resize, see: https://github.com/plotly/angular-plotly.js/issues/182#issuecomment-1264324564 */}
                    <Split initialPrimarySize='23em' onSplitChanged={() => window.dispatchEvent(new Event('resize'))}>
                        <div>
                            {/* Left part of the page */}

                            <div style={{ height: '100vh', overflowY: 'auto', padding: '0px', overscrollBehavior: 'contain' }}>
                                <div style={{ position: 'relative' }}>
                                    <a href="#" onClick={this.props.goBack} className="link-unstyled">
                                        <i className="fas fa-chevron-left" style={{ marginRight: '10px', fontSize: 'large' }}></i>
                                        <img src="icon2.svg" height="50" />
                                        <span style={{ marginLeft: '10px', fontSize: 'large', fontWeight: 'bold' }}>Plotplot</span>
                                    </a>
                                    <div style={{ position: 'absolute', bottom: '0', right: '0', fontSize: 'x-small', fontVariant: 'small-caps' }}>
                                        v. {preval`module.exports = new Date().toLocaleString();`}
                                    </div>
                                </div>
                                <Card style={{ width: '98%', margin: '5px' }}>
                                    <Card.Header style={{ backgroundColor: '#e7f1ff', color: '#0c63e4' }}>Subsets</Card.Header>
                                    <Card.Body style={{ padding: '8px', paddingLeft: '11px', margin: '5px' }}>
                                        <SubsetList
                                            subsets={subsets}
                                            initSubsetOrder={this.initSubsetOrder}
                                            setSubsets={this.setSubsets}
                                            renameSubset={this.renameSubset}
                                            scrollIntoViewSubset={scrollIntoViewSubset}
                                            searchString={this.state.searchFilterSubsets ? this.state.searchString : ''}
                                            toastError={this.toastError}
                                            dataId={this.props.dataId}
                                            clearScroll={this.clearScroll}
                                            downloadCsvDialog={this.downloadCsvDialog}
                                            setSubsetOrder={this.setSubsetOrder}
                                            subsetOrder={this.state.subsetOrder}
                                            lastSubsetChange={this.state.lastSubsetChange}
                                        />
                                    </Card.Body>
                                </Card>
                                <Card style={{ width: '98%', margin: '5px' }}>
                                    <Card.Header style={{ backgroundColor: '#e7f1ff', color: '#0c63e4' }}>Variables</Card.Header>
                                    <Card.Body>
                                        <VariableList
                                            setAllColumns={this.setAllColumns}
                                            numericColumns={this.state.columns}
                                            nonNumericColumns={this.state.nonNumericCols}
                                            colLabels={this.state.colLabels}
                                            searchString={this.state.searchFilterSubsets ? '' : this.state.searchString}
                                            toastError={this.toastError}
                                            dataId={this.props.dataId}
                                            scrollAndHighlightVar={scrollAndHighlightVar}
                                            clearScroll={this.clearScroll}
                                            isNewVarList={isNewVarList}
                                            filterDialog={this.filterDialog}
                                            updateHoverlist={this.updateHoverlist}
                                            hoverlistNumeric={this.state.hoverlistNumeric}
                                            hoverlistNonNumeric={this.state.hoverlistNonNumeric}
                                        />
                                    </Card.Body>
                                </Card>

                                <div style={{ visibility: 'hidden' }}>
                                    {/* Some elements that are about the same height as the math box, so they provide space when the box is expanded
                                    at the bottom of the page. */}
                                    <Button variant="outline-secondary"><i className="fas fa-chevron-down"></i></Button>
                                    <br />
                                    <Button variant="outline-secondary"><i className="fas fa-chevron-down"></i></Button>
                                </div>
                            </div>
                            <SearchBox
                                visibility=""
                                position="fixed"
                                searchFilterSubsets={this.state.searchFilterSubsets}
                                handleSearchFilterTypeChange={this.handleSearchFilterTypeChange}
                                onSearchChange={this.onSearchChange}
                                searchBoxRef={this.searchBoxRef}
                            />
                        </div>
                        <div style={{ height: '100vh', overflowY: 'auto', padding: '0px', overscrollBehavior: 'contain' }}>
                            {/* Header / filename logout code */}
                            <div style={{ paddingLeft: '10px', paddingTop: '10px', paddingRight: '10px', display: 'flex', alignItems: 'center' }}>
                                <span style={{ fontSize: '125%', fontFamily: 'monospace', marginBottom: '0px', overflowWrap: 'anywhere', flex: '1 1 auto' }}>{this.props.filename}</span>
                                <div style={{ flex: '0 1 0', paddingRight: '20px', width: '100%', textAlign: 'end' }}>
                                    {shareButton}
                                </div>
                                <span style={{ textAlign: 'end', flex: '0 0 auto' }}>
                                    {user_data}
                                    <Button
                                        variant="outline-secondary"
                                        style={{ marginLeft: '10px', fontSize: 'small' }}
                                        onClick={() => {
                                            this.setState({ showReportBugDialog: true })
                                        }}
                                    >Report bug</Button>
                                </span>
                            </div>

                            {/* Plots */}
                            {plots}
                            <Collapse in={!mathExpanded}>
                                <div style={{ textAlign: 'right', position: 'fixed', right: '0', bottom: '0', marginRight: '10px' }}>
                                    <a className="custom-css btn btn-primary btn-lg" onClick={() => {
                                        this.setState({ mathExpanded: !mathExpanded })
                                    }} style={{
                                        borderBottomRightRadius: "0px",
                                        borderBottomLeftRadius: '0px',
                                        borderTopLeftRadius: '20px',
                                        borderTopRightRadius: '20px',
                                    }}>Math<span style={{ display: 'inline-block', width: '3px' }}></span> <i className="fas fa-chevron-up"></i></a>
                                </div>
                            </Collapse>
                            <MathBox setColumns={this.setColumns} expanded={mathExpanded} collapse={() => this.setState({ mathExpanded: false })} dataId={this.props.dataId} />

                        </div>
                    </Split>
                </DndProvider>
                <ToastContainer style={{ zIndex: 200000 }} className="p-3" position="bottom-center" containerPosition="fixed">
                    <Toast onClose={this.closeToast} show={showToast} delay={8000} autohide>
                        <Toast.Header>
                            <img
                                src="holder.js/20x20?text=%20"
                                className="rounded me-2"
                                alt=""
                            />
                            <strong className="me-auto">Error</strong>
                        </Toast.Header>
                        <Toast.Body style={{ whiteSpace: 'pre-line' }}>{errorToast}</Toast.Body>
                    </Toast>
                </ToastContainer>

                <CsvExportDialog
                    dataId={this.props.dataId}
                    show={this.state.showCsvDialog}
                    hideCsvDialog={this.hideCsvDialog}
                    nonNumericCols={this.state.nonNumericCols}
                    numericCols={this.state.columns}
                    toastError={this.toastError}
                    subsetId={this.state.exportSubsetId}
                    subsetName={exportSubsetName}
                    subsets={this.state.subsets}
                    filename={this.props.filename}
                    saveCsvCheckboxState={this.saveCsvCheckboxState}
                    savedCsvCheckboxState={this.state.savedCsvCheckboxState}
                    backendConfig={this.props.backendConfig}
                />

                <FilterDialog
                    dataId={this.props.dataId}
                    show={this.state.showFilterDialog}
                    hideFilterDialog={this.hideFilterDialog}
                    toastError={this.toastError}
                    varName={this.state.filterDialogVar}
                    subsets={this.state.subsets}
                    completeFilter={this.completeFilter}
                    filterDialogJustLoaded={this.state.filterDialogJustLoaded}
                    dialogLoadedDone={() => this.setState({ filterDialogJustLoaded: false })}
                    setSubsets={this.setSubsets}
                    allSubsetNames={allSubsetNames}
                />

                <ScreenshotDialog
                    show={this.state.showScreenshotDialog}
                    hideScreenshotDialog={() => {
                        this.setState({ showScreenshotDialog: false })
                    }}
                    screenshotState={this.state.screenshotState}
                    setScreenshotState={this.setScreenshotState}
                    plotState={this.state.screenshotPlot}
                    restrictZoomX={this.state.restrictZoomX}
                    restrictZoomY={this.state.restrictZoomY}
                    subsetOrder={this.state.subsetOrder}
                    subsets={this.state.subsets}
                    filename={this.props.filename}
                />

                <ReportBugDialog
                    show={this.state.showReportBugDialog}
                    hideReportBugDialog={() => {
                        this.setState({ showReportBugDialog: false })
                    }}
                    downloadBugReportJson={this.downloadBugReportJson}
                    userName={this.props.name}
                />
            </div>
        )
    }
}

class SearchBox extends React.Component {
    render() {
        return (
            <div style={{
                position: 'fixed',
                bottom: '0',
                borderTop: 'solid 2px', borderColor: '#0d6efd', backgroundColor: 'white',
                visibility: this.props.visibility,
                width: 'var(--react-split-primary)',
                zIndex: 2,
            }}>
                {/* <div style={{ padding: '10px' }}>
                    <ButtonGroup style={{ width: '100%' }} >
                        <Form.Control type="text" placeholder="filter: mouse*enr" onChange={this.props.onSearchChange} />
                        <div style={{ position: 'relative', width: '0px', height: '0px' }}>
                            <Button onClick={(e) => { }} style={{ position: 'absolute', width: '36px', left: '-36px', height: '38px', top: '0px', border: '0px', borderTopLeftRadius: '0px', borderBottomLeftRadius: '0px', outline: 'none', boxShadow: 'none' }} variant="outline-secondary">
                                <i className="fas fa-times"></i>
                            </Button>
                        </div>
                    </ButtonGroup>
                </div> */}
                <div style={{ padding: '10px' }}>
                    <Form.Group style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Form.Label>Filter:</Form.Label>
                        <div>
                            <Form.Check
                                type="radio"
                                id="search-filter-subsets-radio"
                                label="Subsets"
                                name="optionGroup"
                                value="Subsets"
                                inline
                                checked={this.props.searchFilterSubsets}
                                onChange={this.props.handleSearchFilterTypeChange}
                            />
                            <Form.Check
                                type="radio"
                                id="search-filter-variables-radio"
                                label="Variables"
                                name="optionGroup"
                                value="Variables"
                                inline
                                checked={!this.props.searchFilterSubsets}
                                onChange={this.props.handleSearchFilterTypeChange}
                            />
                        </div>
                    </Form.Group>
                    <SearchBoxWithClearButton
                        placeholder="filter: mouse*enr"
                        onChange={this.props.onSearchChange}
                        style={{ width: '100%' }}
                        searchBoxRef={this.props.searchBoxRef}
                    />
                </div>
            </div>
        )
    }
}

export { Plotplot };



