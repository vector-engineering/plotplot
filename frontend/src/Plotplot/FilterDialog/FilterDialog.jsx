import React from 'react';
import { Form, Modal, Button, Table, OverlayTrigger, Tooltip, Spinner } from 'react-bootstrap';
import { nFormatter, matchesSearch, validateName, colorNameToHex, makeNameUnique } from '../../utility';
import { SearchBoxWithClearButton } from '../SearchBoxWithClearButton';
import { FormattedNumberWithOverlay } from '../FormattedNumberWithOverlay';
import FilterRow from './FilterRow';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

export default class FilterDialog extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            filters: [],
            totalRows: null,
            totalNumFilters: 1,
            showCheckboxes: false,
            uniqueStrings: [],
            loaded: false,
            numUnique: null,
            checkboxFilter: '',
            checkboxState: null,
            loading: false,
            stringsToRows: {},
            subsetLoaded: null,
            validFilters: true,
            /** Toggle For swapping between adding filters and naming the newly created filter */
            showNameFilterModalBody: false,
            /** variable for "Filter name" input.  */
            filterNameControlValue: '',
            /** Filter ID from newly created filter. Should be set null after choosing new name */
            newFilterId: undefined,
            hasFocusedFilterName: false,
            newFilterResult: null,
            subsetSelectedId: 0,
            activeTab: 'filter',
            showSpinnerOnFilterButton: false,
            bulkImportError: null,
            numChecked: 0, // number of checkboxes checked.
            contains: true,
            computedLevenshteinN: null,
            levenshteinSeq: '',
            levenshteinNumRows: '--',
        }

        this.filterBoxRef = React.createRef()
        this.bulkTextBoxRef = React.createRef()
        this.searchBoxRef = React.createRef()
        this.levenshteinNRef = React.createRef()

        this.levenshteinTimeout = null
        this.levenshteinN_Timeout = null

        this.handleSelect = this.handleSelect.bind(this);
        this.doBulkImport = this.doBulkImport.bind(this);
        this.doFilter = this.doFilter.bind(this)
        this.addClick = this.addClick.bind(this)
        this.removeClick = this.removeClick.bind(this)
        this.getResult = this.getResult.bind(this)
        this.reset = this.reset.bind(this)
        this.getNewFilter = this.getNewFilter.bind(this)
        this.getUniqueStrings = this.getUniqueStrings.bind(this)
        this.getCheckboxesTable = this.getCheckboxesTable.bind(this)
        this.updateCheckboxState = this.updateCheckboxState.bind(this)
        this.checkOrUncheckAll = this.checkOrUncheckAll.bind(this)
        this.initCheckboxState = this.initCheckboxState.bind(this)
        this.onCheckboxSearchChange = this.onCheckboxSearchChange.bind(this)
        this.defaultChecked = this.defaultChecked.bind(this)
        this.clearFilterbox = this.clearFilterbox.bind(this)
        this.updateUniqueRowsCheckboxes = this.updateUniqueRowsCheckboxes.bind(this)
        this.onSubsetChange = this.onSubsetChange.bind(this)
        this.finishRenaming = this.finishRenaming.bind(this)
        this.handleModalNamingEnter = this.handleModalNamingEnter.bind(this)
        this.handleCloseFilterDialog = this.handleCloseFilterDialog.bind(this)
        this.handleModalNamingFocus = this.handleModalNamingFocus.bind(this)
        this.renameFilterInResult = this.renameFilterInResult.bind(this)
        this.setSelectedSubset = this.setSelectedSubset.bind(this)
        this.createMultipleSubsetsFromCheckboxes = this.createMultipleSubsetsFromCheckboxes.bind(this)
        this.processMultiSubsetCreationResponse = this.processMultiSubsetCreationResponse.bind(this)
        this.handleContainsChanged = this.handleContainsChanged.bind(this)
        this.onFilterChangeImmediate = this.onFilterChangeImmediate.bind(this)
        this.setLevenshteinN = this.setLevenshteinN.bind(this)
        this.maybeLevenshteinSeqChanged = this.maybeLevenshteinSeqChanged.bind(this)
        this.updateLevenshtein = this.updateLevenshtein.bind(this)
        this.filterLevenshtein = this.filterLevenshtein.bind(this)
    }

    /**
     * Resets component state
     */
    reset() {
        this.setState({
            filters: [this.getNewFilter()],
            totalRows: null,
            loaded: false,
            numUnique: null,
            stringsToRows: {},
            checkboxFilter: '',
            checkboxState: null,
            subsetLoaded: null,
            showNameFilterModalBody: false,
            filterNameControlValue: '',
            newFilterId: null,
            newFilterResult: null,
            subsetSelectedId: 0,
            showSpinnerOnFilterButton: false,
            bulkImportError: null,
            activeTab: 'filter',
            showSpinnerOnFilterButton: false,
            bulkImportError: null,
            numChecked: 0, // number of checkboxes checked.
            levenshteinSeq: '',
            levenshteinNumRows: '--',
        })
    }

    handleSelect(key) {
        this.setState({ activeTab: key });
    }

    componentDidMount() {
        this.reset()
    }

    componentDidUpdate() {
        if (this.props.filterDialogJustLoaded) {
            // Consider resetting.
            this.props.dialogLoadedDone()
            this.reset()
            this.getUniqueStrings(0)
        }
    }

    doBulkImport() {
        //Take the entire text box and send it to the backend. 
        //We need to fetch from the backend 

        const bulk_dictionary = {
            bulkImport: this.bulkTextBoxRef.current.value,
            filterColumn: this.props.varName,
            subset_id: parseInt(this.state.subsetSelectedId),
            use_contains: this.state.contains,
        };

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bulk_dictionary)
        }

        this.setState({
            showSpinnerOnFilterButton: true,
        })

        fetch("api/" + this.props.dataId + "/bulk_import", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.toastError(result['error'])
                        console.log(result['error'])
                        this.setState({
                            loading: false,
                            loaded: true,
                            bulkImportError: result['error'],
                            showSpinnerOnFilterButton: false,
                        })
                        return
                    }

                    this.processMultiSubsetCreationResponse(result)
                }
            )

    };

    processMultiSubsetCreationResponse(result) {
        // Assign colors and sizes to the new filters.
        let subsets_out = result['all_subsets']
        for (let subset of result['new_subsets']) {
            // Set the name in the output subsets.  This will be merged in by setSubsets(...) in Plotplot.
            subsets_out[subset['id']]['name'] = makeNameUnique(this.props.subsets, subset['name'])

            if (subset['color'] != null) {
                // Convert color to a hex value.
                let hex = colorNameToHex(subset['color'])
                if (hex != null) {
                    subsets_out[subset['id']]['color'] = hex
                }
            }

            if (subset['size'] != null) {
                subsets_out[subset['id']]['size'] = parseInt(subset['size'])
            }
        }

        // Set the new subsets
        this.props.setSubsets(subsets_out);

        this.setState({
            bulkImportError: null,
        })

        // Hide the dialog.
        this.props.hideFilterDialog(null);
    }
    doFilter(event, createMultipleSubsets = false) {

        // conditional to test if the user isin bulk import tab or not
        // if true we'll call a new function doBulkimport, otherwise, continue
        // doBulkimport function is going to make a API fetch call and see what the backend says.

        this.setState({
            bulkImportError: null,
        })

        if (this.state.activeTab == 'bulk') {
            this.doBulkImport()
        } else {

            if (this.state.showCheckboxes) {
                const checkboxState = this.state.checkboxState
                // convert checkbox state into a filter call
                let filters = []
                for (let key in checkboxState) {
                    if (checkboxState[key]) {
                        filters.push({ 'filter': key, 'key': key })
                    }
                }
                this.getResult(filters, true, parseInt(this.state.subsetSelectedId), true, createMultipleSubsets)
            } else {
                this.getResult(this.state.filters, true)
            }

            if (!createMultipleSubsets) {
                this.setState({
                    showNameFilterModalBody: true,
                    hasFocusedFilterName: false,
                });
                setTimeout(() => { document.getElementById('filterNameInput').focus() }, 100);
            }
        }
    }

    onFilterChange(num, e) {
        let filters = this.state.filters

        filters[num]['filter'] = e.target.value
        filters[num]['rows'] = null

        this.setState({
            filters: filters
        })

        this.getResult(filters, false)
    }

    onFilterChangeImmediate(num, e) {
        // We don't want to recompute yet, but we should invalidate the numbers we are showing.
        let filters = this.state.filters
        filters[num]['rows'] = null
        this.setState({
            filters: filters,
            totalRows: null,
        })
    }

    setSelectedSubset(id) {
        this.setState({
            subsetSelectedId: id,
        })
    }

    handleContainsChanged(e) {
        let filters = this.state.filters
        for (let i in filters) {
            filters[i]['rows'] = null
        }
        this.setState({
            filters: filters,
            contains: e.target.checked,
            totalRows: null,
        })
        this.getResult(this.state.filters, false, null, false, false, e.target.checked)
    }

    getUniqueStrings(subsetId, allowChangeToShowCheckboxes = true) {
        this.setState({
            loading: true
        })

        const filter_var = this.props.varName

        let request_vals = {
            subset_id: parseInt(subsetId),
            filter_var: filter_var,
        }

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request_vals)
        }

        fetch("api/" + this.props.dataId + "/get_unique_strings", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.toastError(result['error'])

                        this.setState({
                            loading: false,
                            loaded: true,
                        })
                        return
                    }

                    // If the number of unique strings is less than 100, show the checkboxes.
                    const numUnique = result['num_unique']

                    if ((!allowChangeToShowCheckboxes && this.state.showCheckboxes) || numUnique <= 100) {
                        // Create a mapping from string to amount in the row
                        let stringsToRows = result['unique']
                        const uniqueStrings = Object.keys(stringsToRows)

                        let checkboxState = this.state.checkboxState
                        if (allowChangeToShowCheckboxes) {
                            checkboxState = this.initCheckboxState(uniqueStrings)
                        } else {
                            // A bunch of checkboxes are about to be hidden.  Uncheck all of them.
                            console.log(stringsToRows)
                            for (let key in checkboxState) {
                                if (!(key in stringsToRows)) {
                                    checkboxState[key] = false
                                }
                            }
                        }
                        this.updateUniqueRowsCheckboxes(checkboxState, stringsToRows)

                        this.setState({
                            showCheckboxes: true,
                            uniqueStrings: uniqueStrings,
                            stringsToRows: stringsToRows,
                            loaded: true,
                            loading: false,
                            numUnique: numUnique,
                            subsetLoaded: subsetId,
                            contains: false,
                        })
                    } else {
                        this.setState({
                            showCheckboxes: false,
                            loaded: true,
                            loading: false,
                            numUnique: numUnique,
                            subsetLoaded: subsetId,
                            contains: true,
                        })
                        this.getResult(this.state.filters, false, parseInt(subsetId))
                    }
                }
            )
    }

    getResult(filters, addSubsetAndClose, subsetId = null, exactMatch = false, createMultipleSubsets = false, contains = null) {
        let filt_array = []
        let filtersValid = true;
        if (contains == null) {
            contains = this.state.contains
        }
        for (let filt of filters) {

            // Check filters for unterminated brackets
            if (filtersValid) {
                const filter = filt['filter']
                let openBracket = false;
                let innerBracketLength = 0;
                let bracketLengths = [];
                let bracketLengthi = 0;
                for (let i = 0; i < filter.length; i++) {
                    if (filter.charAt(i) == '[' && !openBracket) {
                        openBracket = true;
                        if (bracketLengths.length > 0) {
                            bracketLengthi++;
                        }
                        if (openBracket) {
                            bracketLengths.push(0);
                        }
                    } else if (filter.charAt(i) == ']' && openBracket) {
                        openBracket = false;
                    } else if (openBracket) {
                        bracketLengths[bracketLengthi]++;
                    }
                }
                bracketLengths.forEach(length => {
                    if (length == 0) {
                        filtersValid = false;
                    }
                });

                if (openBracket) {
                    filtersValid = false;
                }

            }
            filt_array.push({ 'filter': filt['filter'], 'key': filt['key'] })
        }

        if (filtersValid) {
            // deciding default filter name 
            let defaultName = '';
            if (filt_array.length === 1) {
                defaultName = `${this.props.varName}: ${filt_array[0]['filter']}`
            } else {
                defaultName = `${this.props.varName}: ${filt_array.length} filters`
            }
            defaultName = makeNameUnique(this.props.subsets, defaultName)
            this.setState({
                filterNameControlValue: defaultName,
                showSpinnerOnFilterButton: createMultipleSubsets,
            });

            let subset = subsetId
            if (subset == null) {
                subset = parseInt(this.state.subsetSelectedId)
            }

            let request_vals = {
                subset_id: subset,
                filters: filt_array,
                filter_var: this.props.varName,
                add_subset: addSubsetAndClose,
                exact_match: exactMatch,
                add_multiple_subsets: createMultipleSubsets,
                use_contains: contains,
            }

            const requestOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request_vals)
            }

            fetch("api/" + this.props.dataId + "/filter", requestOptions)
                .then(res => res.json())
                .then(
                    (result) => {
                        if ('error' in result) {
                            this.props.toastError(result['error'])
                            return;
                        }
                        if (createMultipleSubsets) {
                            return this.processMultiSubsetCreationResponse(result)
                        }

                        const filter_results = result['filter_results']
                        const totalRows = result['total_rows']

                        if (!this.state.showCheckboxes) {
                            const filters = this.state.filters

                            // Ensure that the return value matches the filters that are there.
                            if (filters.length != filter_results.length) {
                                console.log('filter length mismatch')
                                return;
                            }
                        }
                        for (let i = 0; i < filters.length; i++) {
                            if (filters[i]['filter'] != filter_results[i]['filter']) {
                                console.log('filter mismatch on ' + i)
                                return;
                            }
                        }

                        if ('new_subset_id' in result) {
                            this.setState({
                                newFilterId: result['new_subset_id'],
                                newFilterResult: result,
                            });
                        } else {
                            if (!this.state.showCheckboxes) {
                                this.setState({
                                    filters: filter_results,
                                    totalRows: totalRows,
                                    validFilters: filtersValid,
                                })
                            }
                        }
                    }
                );
        } else {
            this.setState({
                validFilters: filtersValid,
            });

        }

    }

    getNewFilter() {
        const totalNumFilters = this.state.totalNumFilters
        this.setState({
            totalNumFilters: totalNumFilters + 1
        })
        return { 'filter': '', 'rows': null, 'key': this.state.totalNumFilters }
    }

    addClick() {
        let filters = this.state.filters
        filters.push(this.getNewFilter())
        this.setState({
            filters: filters,
        })
    }

    removeClick(removeIdx) {
        let filters = this.state.filters
        filters.splice(removeIdx, 1)
        this.setState({
            filters: filters
        })
        if (removeIdx == 0 && filters.length < 1) {
            this.addClick()
        }

        // Update the number of unique rows
        this.getResult(filters, false)
    }

    onSubsetChange(e) {
        const subsetToFilter = parseInt(e.target.value)
        this.setSelectedSubset(subsetToFilter)

        if (this.state.showCheckboxes) {
            // Reset all of the row number labels
            let clearedStringsToRows = this.state.stringsToRows
            for (let idx in clearedStringsToRows) {
                clearedStringsToRows[idx] = null
            }

            this.setState({
                stringsToRows: clearedStringsToRows,
            })

            // Update the row numbers.
            this.getUniqueStrings(subsetToFilter, false)
        } else {
            // Invalidate all filter numbers.
            let filters = this.state.filters
            for (let i in filters) {
                filters[i]['rows'] = null
            }

            this.setState({
                filters: filters,
                totalRows: null
            })
            // filters, addSubsetAndClose, subsetId = null, exactMatch = false, createMultipleSubsets = false, contains = null
            this.getResult(this.state.filters, false, subsetToFilter)
        }
    }

    createMultipleSubsetsFromCheckboxes(e) {
        // Tell the backend we want to create multiple subsets with exact matching.
        this.doFilter(e, true)

    }

    finishRenaming() {
        if (validateName(this.props.allSubsetNames, '', this.state.filterNameControlValue)) {
            // We add the name into the result, which normally will only have an ID and some other subset data.  The name will get merged in by
            // the main setSubsets(...) function.
            let renamedFilterResult = this.renameFilterInResult(this.state.newFilterResult['subsets'], this.state.newFilterId, this.state.filterNameControlValue)
            this.props.completeFilter(this.state.newFilterId, renamedFilterResult);
            this.handleCloseFilterDialog(true);
        } else {
            this.props.toastError("There is already a subset named \"" + this.state.filterNameControlValue + "\".  Name must be unique.")
        }
    }

    renameFilterInResult(result_subsets, filter_id, new_name) {
        for (let [id, filt] of Object.entries(result_subsets)) {
            if (filt['id'] == filter_id) {
                filt['name'] = new_name
                break
            }
        }
        return result_subsets
    }

    handleModalNamingEnter(e) {
        if (this.state.newFilterId && e.code === "Enter") {
            this.finishRenaming()
        }
    }

    handleCloseFilterDialog(keepFilter) {
        let delete_id = null
        if (!keepFilter) {
            // The dialog was cancelled.  If the backend has already created a subset and the user cancelled during the renaming
            // step, we need to delete that subset.
            delete_id = this.state.newFilterId
        }
        this.props.hideFilterDialog(delete_id);

        if (this.state.showNameFilterModalBody) {
            // We are closing but the rename is being shown.  Don't save state.
            setTimeout(this.reset, 200) // delay the reset slightly so the main dialog doesn't flash during the fadeout animation.
        }
    }

    handleModalNamingFocus(e) {
        e.target.select()
    }

    // ------- checkbox functions ------- //

    updateCheckboxState(e) {
        let checkboxState = this.state.checkboxState
        checkboxState[e.target.id] = e.target.checked
        this.setState({
            checkboxState: checkboxState
        })
        this.updateUniqueRowsCheckboxes(checkboxState, this.state.stringsToRows)
    }

    updateUniqueRowsCheckboxes(checkboxState, stringsToRows) {
        let total = 0
        let num_checked = 0
        for (let key in checkboxState) {
            if (checkboxState[key]) {
                total += stringsToRows[key]
                num_checked += 1
            }
        }
        this.setState({
            totalRows: total,
            numChecked: num_checked,
        })
    }

    initCheckboxState(uniqueStrings) {
        let checkboxState = {}
        if (uniqueStrings.length < 1) {
            return
        }
        for (let i = 0; i < uniqueStrings.length; i++) {
            let id = uniqueStrings[i]
            checkboxState[id] = true
        }

        this.setState({
            checkboxState: checkboxState,
        })
        return checkboxState
    }

    checkOrUncheckAll(checked) {
        let checkboxState = this.state.checkboxState
        const uniqueStrings = this.state.uniqueStrings
        for (let i = 0; i < uniqueStrings.length; i++) {
            let id = uniqueStrings[i]
            const el = document.getElementById(id)
            if (el != null && matchesSearch(id, this.state.checkboxFilter)) {
                el.checked = checked
                checkboxState[id] = checked

            }
        }
        this.setState({
            checkboxState: checkboxState
        })
        this.updateUniqueRowsCheckboxes(checkboxState, this.state.stringsToRows)
    }

    clearFilterbox() {
        this.filterBoxRef.current.value = ''
        this.filterBoxRef.current.focus()
        this.setState({
            checkboxFilter: ''
        })
    }

    onCheckboxSearchChange(text) {
        this.setState({
            checkboxFilter: text
        })
    }

    defaultChecked(id) {
        if (this.state.checkboxState && Object.keys(this.state.checkboxState).includes(id)) {
            return this.state.checkboxState[id]
        }
        return true
    }

    getCheckboxesTable() {
        let cols = []
        const totalRows = this.state.totalRows
        let numVisible = 0
        let loadedAllCheckboxRows = true
        const stringsToRows = this.state.stringsToRows
        for (let val of this.state.uniqueStrings) {
            if (matchesSearch(val, this.state.checkboxFilter)) {
                cols.push((
                    <td style={{ overflowWrap: 'anywhere' }} key={val}>
                        <Form.Check type="checkbox" label={val} id={val} key={val} defaultChecked={this.defaultChecked(val)} onChange={this.updateCheckboxState} />
                    </td>
                ))
                const rowVal = stringsToRows[val]
                if (rowVal == null) {
                    cols.push((<td style={{ minWidth: '40px' }} key={'--' + val}>--</td>))
                    loadedAllCheckboxRows = false
                } else {
                    cols.push((
                        <td style={{ minWidth: '40px' }} key={val + rowVal}>
                            <FormattedNumberWithOverlay
                                value={rowVal}
                                postText=" "
                                placement="left"
                                style={{}}
                                nullText="--"
                            />
                        </td>
                    ))
                }
                numVisible += 1
            }
        }

        let rows = []
        const numColsPerRow = 8
        for (let i = 0; i < cols.length / numColsPerRow; i++) {
            rows.push(
                <tr key={'row' + this.state.uniqueStrings[i]}>
                    {(() => {
                        let container = []
                        for (let j = i * numColsPerRow; j < i * numColsPerRow + numColsPerRow; j++) {
                            if (cols.length <= j) {
                                container.push(<td key={'none' + j}></td>)
                            } else {
                                container.push(cols[j])
                            }
                        }

                        return container
                    })()
                    }
                </tr>
            )
        }

        let totalRowsStr = '--'
        if (loadedAllCheckboxRows) {
            totalRowsStr = 
             <FormattedNumberWithOverlay
                value={totalRows}
                postText=" "
                placement="left"
                style={{}}
                nullText="--"
            />
        }

        return {
            'table': (
                <Table striped>
                    <thead>
                    </thead>
                    <tbody>
                        {rows}
                        <tr>
                            <td colSpan={numColsPerRow} style={{ textAlign: 'right' }}>
                                <strong>{totalRowsStr} unique rows</strong>
                            </td>
                            <td></td>
                        </tr>
                    </tbody>
                </Table>
            ),
            'numVisible': numVisible
        }
    }


    // ------- end checkbox functions ------- //

    setLevenshteinN(e) {
        const n = this.levenshteinNRef.current.value
        if (n == this.state.computedLevenshteinN) {
            // No change.
            return
        }

        this.setState({
            levenshteinNumRows: '--',
        }, () => {
            this.updateLevenshtein()
        })
    }

    maybeLevenshteinSeqChanged(e) {
        const incomingSeq = e.target.value

        if (this.state.levenshteinSeq == incomingSeq) {
            // No change.
            return
        }

        // If we're here, there was a change.
        this.setState({
            levenshteinSeq: incomingSeq,
            levenshteinNumRows: '--',
        }, () => {
            this.updateLevenshtein()
        })
    }

    filterLevenshtein() {
        this.updateLevenshtein(true)

        this.setState({
            showNameFilterModalBody: true,
            hasFocusedFilterName: false,
            filterNameControlValue: `${this.props.varName}: ${this.state.levenshteinSeq} | levenshtein <= ${this.state.levenshteinN}`
        });
        setTimeout(() => { document.getElementById('filterNameInput').focus() }, 100);
    }

    updateLevenshtein(add_new_subset = false) {
        // Make a call to the backend to get the levenshtein distance.
        this.setState({
            levenshteinNumRows: <Spinner animation="border" size="sm" />
        })

        const levenshteinN = parseInt(this.levenshteinNRef.current.value)
        if (!Number.isInteger(levenshteinN)) {
            console.log("bail")
            this.setState({
                loading: false,
                loaded: true,
                levenshteinNumRows: '--',
                showSpinnerOnFilterButton: false,
            })
            return
        }

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filter_var: this.props.varName,
                subset_id: parseInt(this.state.subsetSelectedId),
                levenshtein_seq: this.state.levenshteinSeq,
                levenshtein_n: levenshteinN,
                add_subset: add_new_subset,
            })
        }

        fetch("api/" + this.props.dataId + "/levenshtein_filter", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.toastError(result['error'])
                        console.log(result['error'])
                        this.setState({
                            loading: false,
                            loaded: true,
                            levenshteinNumRows: '--',
                            showSpinnerOnFilterButton: false,
                        })
                        return
                    } else {
                        if ('new_subset_id' in result) {
                            this.setState({
                                newFilterId: result['new_subset_id'],
                                newFilterResult: result,
                            });
                        }

                        this.setState({
                            levenshteinNumRows: <FormattedNumberWithOverlay
                                                    value={result['matching_levenshtein_rows']}
                                                    postText=""
                                                    placement="right"
                                                    style={{}}
                                                    nullText="--"
                                                />,
                            computedLevenshteinN: result['levenshtein_n']

                        })
                    }
                }
            )
    }

    render() {
        const showCheckboxesDisp = this.state.showCheckboxes ? '' : 'none'
        const showCheckboxesDispNot = this.state.showCheckboxes ? 'none' : ''
        let modalWidthClass = 'modal-90w'

        let subsetRows = []
        if (this.props.subsets) {
            for (let [id, subset] of Object.entries(this.props.subsets)) {
                subsetRows.push(
                    <option value={subset['id']} key={subset['id']}>{subset['name']} - {nFormatter(subset['count'])}</option>
                )
            }
        }

        let filterRows = []
        const filters = this.state.filters
        let totalRows = (this.state.totalRows !== null ? this.state.totalRows : '--')
        for (let i = 0; i < filters.length; i++) {
            filterRows.push(
                <FilterRow
                    key={filters[i]['key']}
                    filterChange={(e) => this.onFilterChange(i, e)}
                    varName={this.props.varName}
                    filter={filters[i]['filter']}
                    rows={filters[i]['rows']}
                    showAddButton={i == filters.length - 1}
                    addClick={this.addClick}
                    removeClick={() => { this.removeClick(i) }}
                    showOr={i != 0}
                    textChanged={(e) => this.onFilterChangeImmediate(i, e)}
                />
            )
        }

        let tableBody = null
        let numVisible = 0
        if (this.state.loaded) {
            if (this.state.showCheckboxes) {
                const temp = this.getCheckboxesTable()
                tableBody = temp['table']
                numVisible = temp['numVisible']
            } else {
                tableBody = (
                    <Table striped>
                        <thead>
                            <tr>
                                <th></th>
                                <th>Filter</th>
                                <th>Rows Matching</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filterRows}
                            <tr>
                                <td></td><td></td><td><strong>
                                    <FormattedNumberWithOverlay
                                        value={totalRows}
                                        postText=" "
                                        placement="left"
                                        style={{}}
                                        nullText="--"
                                    />
                                    <OverlayTrigger key={'ranked'} placement={'bottom'}
                                        overlay={
                                            <Tooltip id="tooltip-edit">
                                                Unique rows &#8800; sum because filters can overlap
                                            </Tooltip>
                                        }
                                    >
                                        <span style={{ textDecorationLine: 'underline', textDecorationStyle: 'dashed', textDecorationThickness: '1px' }}>unique</span>
                                    </OverlayTrigger> rows</strong></td><td></td>
                            </tr>
                        </tbody>

                    </Table>
                )
            }
        } else {
            tableBody = (<div>Loading...</div>)
        }

        let titleRows = ''
        const numUnique = this.state.numUnique
        if (numUnique != null) {
            titleRows = ' - ' + nFormatter(numUnique) + ' unique strings'
        }

        let modalBody;
        const processing_filter = (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                Processing filter... <Spinner animation="border" style={{ marginLeft: '5px', marginRight: '5px' }} />
            </div>
        )

        if (this.state.showNameFilterModalBody) {
            modalWidthClass = 'modal-50w'
            modalBody = (
                <Modal.Body>
                    <div style={{ width: '100%' }}>
                        <Form.Group placeholder="example-filter-name-1...">
                            <Form.Label>Filtered subset name:</Form.Label>
                            <Form.Control
                                id='filterNameInput'
                                value={this.state.filterNameControlValue}
                                onChange={(e) => { this.setState({ filterNameControlValue: e.target.value }) }}
                                onFocus={this.handleModalNamingFocus}
                                onKeyUp={this.handleModalNamingEnter}
                                style={{ width: '50%' }}
                            />
                        </Form.Group>

                    </div>
                    <div style={{ textAlign: 'end' }}>
                        <Button
                            style={{ marginRight: '5px' }}
                            // Need newFilterId to rename filter, using as a loading state proxy
                            onClick={this.state.newFilterId ? this.finishRenaming : null}
                            disabled={this.state.newFilterId ? false : true}
                        >
                            {this.state.newFilterId ? 'Save' : processing_filter}
                        </Button>
                    </div>
                </Modal.Body>);
        } else {
            let spinnerButton = null
            let createMultiSubsetButton = null
            let stxt = this.state.numChecked != 1 ? 's' : ''
            if (this.state.showSpinnerOnFilterButton) {
                spinnerButton = (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        Filtering... <Spinner animation="border" variant="light" style={{ marginLeft: '5px', marginRight: '5px' }} />
                    </div>)
                createMultiSubsetButton = (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        Creating {this.state.numChecked} subset{stxt}... <Spinner animation="border" variant="dark" style={{ marginLeft: '5px', marginRight: '5px' }} />
                    </div>)
            } else {
                spinnerButton = 'Filter'
                createMultiSubsetButton = 'Create ' + this.state.numChecked + ' subset' + stxt
            }

            let createMultiSubsetButtonDisp = 'none'
            if (this.state.showCheckboxes) {
                createMultiSubsetButtonDisp = ''
            }

            let bulkError = ''
            if (this.state.bulkImportError) {
                bulkError = (
                    <div className="math-error">
                        <p style={{ color: "red" }}>
                            Error:
                        </p>
                        {this.state.bulkImportError}
                    </div>
                )
            }

            let textFilterContent = (<><div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ flexShrink: '0' }}>Include rows where <span style={{ fontSize: '125%' }}><strong><code>{this.props.varName}</code></strong></span> contains:</span>
                <span style={{ textAlign: 'end', flex: '1 1 auto', width: '100%', padding: '10px', display: showCheckboxesDisp }}>
                    {/* <ButtonGroup style={{ width: '40%'}}>
                        <Form.Control ref={this.filterBoxRef} type="text" placeholder="filter" onChange={this.onCheckboxSearchChange} style={{ display: 'inline', width: '100%',  }} defaultValue={this.state.checkboxFilter} />
                        <Button onClick={this.clearFilterbox} className="clear-searchbox-button" variant="outline-secondary" style={{ marginRight: '10px' }}><i className="fas fa-times"></i></Button>
                    </ButtonGroup> */}
                    <SearchBoxWithClearButton
                        onChange={this.onCheckboxSearchChange}
                        placeholder="filter"
                        style={{ width: '40%', paddingRight: '20px' }}
                        searchBoxRef={this.searchBoxRef}
                    />
                    <Button onClick={() => this.checkOrUncheckAll(true)} variant="outline-primary" style={{ margin: '5px' }} >Check all visible ({numVisible})</Button>
                    <Button onClick={() => this.checkOrUncheckAll(false)} variant="outline-primary" >Uncheck all visible ({numVisible})</Button>
                </span>
            </div>
                <p style={{ display: showCheckboxesDispNot }}><code>*</code> = any number of characters, <code>?</code> = single character, <code>[ABC]</code> = either, A, B, or C</p>
                <Form.Check type="switch" style={{ display: showCheckboxesDispNot }} checked={this.state.contains} id="contains-true" onChange={(e) => { this.handleContainsChanged(e) }} label={(<>include strings that contain the filter: <code>AA</code> will {this.state.contains ? '' : ' not '} match <code>TT<u>AA</u>CC</code></>)} />
                <div>
                    {tableBody}
                </div>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <div>
                        <OverlayTrigger
                            overlay={
                                <Tooltip id={`tooltip-bracket-warning`}>
                                    Create a <strong>different</strong> subset for each selected option
                                </Tooltip>
                            }
                        >
                            <Button variant="outline-secondary" disabled={this.state.numChecked < 1 || this.state.showSpinnerOnFilterButton} style={{ margin: '10px', display: createMultiSubsetButtonDisp }} onClick={this.createMultipleSubsetsFromCheckboxes}>
                                {createMultiSubsetButton}
                            </Button>
                        </OverlayTrigger>
                    </div>
                    <div style={{ textAlign: 'end', flexGrow: 1 }}>
                        <OverlayTrigger
                            show={!this.state.validFilters}
                            overlay={
                                <Tooltip id={`tooltip-bracket-warning`}>
                                    A filter is invalid.
                                </Tooltip>
                            }
                        >
                            <Button style={{ marginRight: '5px' }} disabled={!this.state.validFilters || this.state.showSpinnerOnFilterButton} onClick={this.doFilter} >Filter</Button>
                        </OverlayTrigger>
                        <Button style={{ margin: '10px', marginLeft: '5px' }} variant="outline-secondary" onClick={(e) => this.handleCloseFilterDialog(false)}>Close</Button>
                    </div>
                    <div style={{ textAlign: 'start' }}>
                    </div>
                </div>
            </>)

            let tabContent = (<>
                <Tabs defaultActiveKey="filter" onSelect={this.handleSelect}>
                    <Tab eventKey="filter" title="Filter">
                        {textFilterContent}
                    </Tab>
                    <Tab eventKey="bulk" title="Bulk Import">
                        <Form>
                            <Form.Group className="mb-3" controlId="exampleForm.ControlTextarea1">
                                <Form.Label style={{ marginTop: '5px' }}>Copy and paste sequences to filter in <strong><code>{this.props.varName}</code></strong>.  Columns must be seperated by <code>tab</code>.  Example files: (<a href="bulk_import_example.xlsx" download>xlxs</a>) (<a href="bulk_import_example.txt" download>txt</a>)<br /><code>*</code> = any number of characters, <code>?</code> = single character, <code>[ABC]</code> = either, A, B, or C</Form.Label>
                                <Form.Check style={{ marginBottom: '10px' }} checked={this.state.contains} type="switch" id="contains-true" onChange={(e) => { this.handleContainsChanged(e) }} label={(<>include strings that contain the filter: <code>AA</code> will {this.state.contains ? '' : ' not '} match <code>TT<u>AA</u>CC</code></>)} />
                                <Form.Control as="textarea" rows={10} placeholder='name      sequence    size [optional]     color (name or RGBA hex) [optional]&#10;-----------------------------------------------------------------------------&#10;Example:&#10;Abcd	ABCDEFG	15	Red&#10;Group 1	HIJKLMN	4	Blue&#10;Group 1	QRST	4	Blue&#10;Group 2	AA	4	#bbbbbbFF&#10;' ref={this.bulkTextBoxRef} style={{ fontFamily: 'monospace' }} />
                            </Form.Group>
                        </Form>
                        {bulkError}
                        <div style={{ textAlign: 'end' }}>
                            <Button style={{ marginRight: '5px' }} disabled={!this.state.validFilters || this.state.showSpinnerOnFilterButton} onClick={this.doFilter} >
                                {spinnerButton}
                            </Button>
                            <Button style={{ margin: '10px', marginLeft: '5px' }} variant="outline-secondary" onClick={(e) => this.handleCloseFilterDialog(false)}>Close</Button>
                        </div>
                        <div style={{ textAlign: 'start' }}>
                        </div>
                    </Tab>
                    <Tab eventKey="levenshtein" title="Hamming/Levenshtein Distance">
                        <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                            Create subsets that are <code>≤ N </code>
                            <OverlayTrigger key={'ranked'} placement={'bottom'}
                                overlay={
                                    <Tooltip id="tooltip-edit">
                                        Informally, the Levenshtein distance between two strings is the minimum number of single-character edits (insertions, deletions or substitutions) required to change one string into the other.
                                    </Tooltip>
                                }
                            >
                                <span style={{ textDecorationLine: 'underline', textDecorationStyle: 'dashed', textDecorationThickness: '1px' }}>Levenshtein distance</span>
                            </OverlayTrigger> from a sequence. (<a href="https://en.wikipedia.org/wiki/Levenshtein_distance" target="_blank">Wikipedia entry</a>)
                        </div>
                        <hr />
                        <Form>
                            <table style={{ width: '50%' }} >
                                <tbody>
                                    <tr>
                                        <td style={{ width: '1%' }}>Distance:</td>
                                        <td>
                                            <Form.Control type="number" step="1" min="1" style={{ width: '5em', marginLeft: '10px', display: 'inline-block', textAlign: 'center' }} defaultValue="3" ref={this.levenshteinNRef} onBlur={this.setLevenshteinN} onKeyUp={(e) => {
                                                if (e.key === 'Enter') {
                                                    this.setLevenshteinN(e)
                                                }
                                            }}
                                                onChange={(e) => {
                                                    // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                                    // change events.
                                                    this.setState({
                                                        levenshteinNumRows: '--'
                                                    })
                                                    if (this.levenshteinN_Timeout != null) {
                                                        clearTimeout(this.levenshteinN_Timeout)
                                                    }
                                                    this.levenshteinN_Timeout = setTimeout(() => {
                                                        this.setLevenshteinN(e)
                                                    }, 1000)
                                                }}
                                            />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>
                                            Sequence:
                                        </td>
                                        <td><Form.Control
                                            style={{ width: '100%', display: 'inline', marginLeft: '10px' }}
                                            type="text"
                                            placeholder='eg TLAVPFK'
                                            autoComplete="off"  // Disables autofill
                                            autoCorrect="off"   // Disables autocorrect on iOS
                                            spellCheck="false"  // Disables spell checking
                                            autoCapitalize="off" // Disables auto capitalization on iOS
                                            defaultValue={this.state.levenshteinSeq}
                                            onBlur={this.maybeLevenshteinSeqChanged}
                                            onKeyUp={(e) => {
                                                if (e.key === 'Enter') {
                                                    this.maybeLevenshteinSeqChanged(e)
                                                }
                                            }}
                                            onChange={(e) => {
                                                // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                                // change events.
                                                this.setState({
                                                    levenshteinNumRows: '--'
                                                })
                                                if (this.levenshteinTimeout != null) {
                                                    clearTimeout(this.levenshteinTimeout)
                                                }
                                                this.levenshteinTimeout = setTimeout(() => {
                                                    this.maybeLevenshteinSeqChanged(e)
                                                }, 1000)
                                            }}
                                        /></td></tr>
                                </tbody>
                            </table>
                            <hr />
                            <div>
                                <strong>Matching rows</strong>: {this.state.levenshteinNumRows}
                            </div>
                        </Form>
                        <div style={{ textAlign: 'end' }}>
                            <Button style={{ marginRight: '5px' }} disabled={!this.state.validFilters || this.state.showSpinnerOnFilterButton} onClick={this.filterLevenshtein} >
                                {spinnerButton}
                            </Button>
                            <Button style={{ margin: '10px', marginLeft: '5px' }} variant="outline-secondary" onClick={(e) => this.handleCloseFilterDialog(false)}>Close</Button>
                        </div>
                    </Tab>
                </Tabs></>)


            let filterContent = null

            if (this.state.showCheckboxes) {
                filterContent = textFilterContent
            } else {
                filterContent = tabContent
            }
            modalBody = (
                <Modal.Body>
                    Subset to filter:
                    <Form.Select style={{ display: 'inline', width: '40%', marginLeft: '8px' }} value={this.state.subsetSelectedId} onChange={this.onSubsetChange} >
                        {subsetRows}
                    </Form.Select>
                    <hr />
                    {filterContent}
                </Modal.Body>);
        }



        return (
            <Modal
                show={this.props.show}
                onHide={(e) => this.handleCloseFilterDialog(false)}
                dialogClassName={modalWidthClass}
                aria-labelledby="example-custom-modal-styling-title"
            >
                <Modal.Header closeButton>
                    <Modal.Title id="filter-export-title">
                        Filter with: <strong><code>{this.props.varName}</code></strong>
                    </Modal.Title>
                </Modal.Header>
                {modalBody}
            </Modal>
        )
    }

}
