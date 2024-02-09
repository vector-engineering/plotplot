import React from 'react';
import { Form, Accordion, Spinner, Modal, Button, Table } from 'react-bootstrap';
import { matchesSearch, downloadWithFakeClick } from '../utility'


class CsvExportDialog extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            filter: '',
            nonNumericTotal: 0,
            nonNumericChecked: 0,
            numericTotal: 0,
            numericChecked: 0,
            isGenerating: false,
            isLoaded: false,
            totalsComputed: false,
            nonNumericCollapsed: false,
            numericCollapsed: false,
            nonNumericCheckboxState: null,
            numericCheckboxState: null,
            showJupyterDialog: false,
            jupyterFileWritten: null,
        }

        this.getRows = this.getRows.bind(this)
        this.checkOrUncheckNonNumeric = this.checkOrUncheckNonNumeric.bind(this)
        this.checkOrUncheckNumeric = this.checkOrUncheckNumeric.bind(this)
        this.checkOrUncheckAll = this.checkOrUncheckAll.bind(this)
        this.downloadCsv = this.downloadCsv.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.updateCheckboxStateNonNumeric = this.updateCheckboxStateNonNumeric.bind(this)
        this.updateCheckboxStateNumeric = this.updateCheckboxStateNumeric.bind(this)
        this.defaultCheckedNonNumeric = this.defaultCheckedNonNumeric.bind(this)
        this.defaultCheckedNumeric = this.defaultCheckedNumeric.bind(this)
        this.computeCheckboxTotals = this.computeCheckboxTotals.bind(this)
        this.maybeInitCheckboxState = this.maybeInitCheckboxState.bind(this)
        this.clearFilterbox = this.clearFilterbox.bind(this)
        this.handleNonNumericHeaderClick = this.handleNonNumericHeaderClick.bind(this)
        this.handleNumericHeaderClick = this.handleNumericHeaderClick.bind(this)
        this.computeCheckboxTotalsHelper = this.computeCheckboxTotalsHelper.bind(this)
        this.handleClose = this.handleClose.bind(this)
        this.toJupyter = this.toJupyter.bind(this)
        this.writeJupyterFile = this.writeJupyterFile.bind(this)

        this.nonNumericRef = React.createRef()
        this.numericRef = React.createRef()
        this.filterBoxRef = React.createRef()
        this.jupyterFilePathRef = React.createRef()

    }

    getRows(checkboxes, changeFunc, defaultCheckedFunc) {
        let rows = []
        let visibleBoxes = []
        if (checkboxes == null || !this.state.isLoaded) {
            rows.push(<tr key="rowloading"><td key="loading">Loading...</td></tr>)
        } else {
            let cols = []
            for (let i = 0; i < checkboxes.length; i++) {
                if (matchesSearch(checkboxes[i], this.state.filter)) {
                    cols.push(
                        <td style={{ overflowWrap: 'anywhere' }} key={checkboxes[i]}><Form.Check type="checkbox" label={checkboxes[i]} id={checkboxes[i]} key={checkboxes[i]} defaultChecked={defaultCheckedFunc(checkboxes[i])} onClick={changeFunc} /></td>
                    )
                    visibleBoxes.push(checkboxes[i])
                }
            }
            // Group into rows of four
            for (let i = 0; i < visibleBoxes.length / 4; i++) {
                rows.push(
                    <tr key={'row' + visibleBoxes[i * 4]}>
                        {(() => {
                            let container = []
                            for (let j = i * 4; j < i * 4 + 4; j++) {
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
        }
        return { 'rows': rows, 'visible': visibleBoxes.length }
    }

    maybeInitCheckboxState() {
        let nonNumericCheckboxState = this.state.nonNumericCheckboxState
        let numericCheckboxState = this.state.numericCheckboxState
        if (this.props.nonNumericCols && !this.state.nonNumericCheckboxState) {
            nonNumericCheckboxState = {}
            for (let col of this.props.nonNumericCols) {
                if (this.props.savedCsvCheckboxState != null && this.props.savedCsvCheckboxState['nonNumericCheckboxState'] && this.props.savedCsvCheckboxState['nonNumericCheckboxState'][col] == false) {
                    nonNumericCheckboxState[col] = false
                } else {
                    nonNumericCheckboxState[col] = true
                }
            }
        }

        if (this.props.numericCols && !this.numericCheckboxState) {
            numericCheckboxState = {}
            for (let col of this.props.numericCols) {
                if (this.props.savedCsvCheckboxState != null && this.props.savedCsvCheckboxState['numericCheckboxState'] && this.props.savedCsvCheckboxState['numericCheckboxState'][col] == false) {
                    numericCheckboxState[col] = false
                } else {
                    numericCheckboxState[col] = true
                }
            }
        }
        if (nonNumericCheckboxState != null && numericCheckboxState != null && !this.state.isLoaded) {
            this.setState({
                isLoaded: true,
                nonNumericCheckboxState: nonNumericCheckboxState,
                numericCheckboxState: numericCheckboxState,
            })
            this.computeCheckboxTotalsHelper(nonNumericCheckboxState, numericCheckboxState)
        }
    }

    updateCheckboxStateNonNumeric(e) {
        let nonNumericCheckboxState = this.state.nonNumericCheckboxState
        nonNumericCheckboxState[e.target.id] = e.target.checked
        this.setState({
            nonNumericCheckboxState: nonNumericCheckboxState
        })

        this.computeCheckboxTotals()
    }

    updateCheckboxStateNumeric(e) {
        let numericCheckboxState = this.state.numericCheckboxState
        numericCheckboxState[e.target.id] = e.target.checked
        this.setState({
            numericCheckboxState: numericCheckboxState,
        })

        this.computeCheckboxTotals()
    }

    computeCheckboxTotals() {
        this.computeCheckboxTotalsHelper(this.state.nonNumericCheckboxState, this.state.numericCheckboxState)
    }

    computeCheckboxTotalsHelper(nonNumericCheckboxState, numericCheckboxState) {
        // Update state on checked/unchecked
        let numericChecked = 0
        let nonNumericChecked = 0

        for (let name in nonNumericCheckboxState) {
            if (nonNumericCheckboxState[name]) {
                nonNumericChecked += 1
            }
        }
        for (let name in numericCheckboxState) {
            if (numericCheckboxState[name]) {
                numericChecked += 1
            }
        }

        this.setState({
            nonNumericTotal: this.props.nonNumericCols != null ? this.props.nonNumericCols.length : 0,
            nonNumericChecked: nonNumericChecked,
            numericTotal: this.props.numericCols != null ? this.props.numericCols.length : 0,
            numericChecked: numericChecked,
            totalsComputed: true,
        })
    }


    defaultCheckedNonNumeric(id) {
        if (this.state.nonNumericCheckboxState && Object.keys(this.state.nonNumericCheckboxState).includes(id)) {
            return this.state.nonNumericCheckboxState[id]
        }
        return true
    }

    defaultCheckedNumeric(id) {
        if (this.state.numericCheckboxState && Object.keys(this.state.numericCheckboxState).includes(id)) {
            return this.state.numericCheckboxState[id]
        }
        return true
    }

    checkOrUncheckNonNumeric(checked) {
        if (this.state.nonNumericCollapsed) {
            return
        }
        let nonNumericCheckboxState = this.state.nonNumericCheckboxState
        for (let id of this.props.nonNumericCols) {
            const el = document.getElementById(id)
            if (el != null && matchesSearch(id, this.state.filter)) {
                el.checked = checked
                nonNumericCheckboxState[id] = checked

            }
        }
        this.setState({
            nonNumericCheckboxState: nonNumericCheckboxState
        })
        this.computeCheckboxTotals()
    }

    checkOrUncheckNumeric(checked) {
        if (this.state.numericCollapsed) {
            return
        }
        let numericCheckboxState = this.state.numericCheckboxState
        for (let id of this.props.numericCols) {
            const el = document.getElementById(id)
            if (el != null && matchesSearch(id, this.state.filter)) {
                el.checked = checked
                numericCheckboxState[id] = checked
            }
        }
        this.setState({
            numericCheckboxState: numericCheckboxState
        })

        this.computeCheckboxTotals()
    }

    checkOrUncheckAll(checked) {
        this.checkOrUncheckNonNumeric(checked)
        this.checkOrUncheckNumeric(checked)
    }

    toJupyter() {
        // Show a new dialog to get the filename
        this.setState({
            showJupyterDialog: true
        })
    }

    writeJupyterFile() {
        // Get the filename
        const file_out = this.jupyterFilePathRef.current.value

        this.downloadCsv(null, file_out)
    }

    downloadCsv(e, jupyter_filename = null) {
        // Pack up state of all the checkboxes.

        const subsets_out = jupyter_filename ? this.props.subsets : null

        const csvColData = {
            'subset_id': this.props.subsetId,
            'nonNumericCols': this.state.nonNumericCheckboxState,
            'numericCols': this.state.numericCheckboxState,
            'jupyterFilename': jupyter_filename,
            'subsets': subsets_out,
        }

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(csvColData)
        }

        this.props.saveCsvCheckboxState(this.state.nonNumericCheckboxState, this.state.numericCheckboxState)

        this.setState({
            isGenerating: true,
        })

        fetch("api/" + this.props.dataId + "/download_subset", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.props.hideCsvDialog()
                        this.props.toastError(result['error'])
                        return
                    }
                    let filename_out = null
                    if ('file_written' in result) {
                        filename_out = result['file_written']
                    }
                    this.setState({
                        isGenerating: false,
                        jupyterFileWritten: filename_out,
                    })
                    if (!jupyter_filename) {
                        // The return value is a uuid that should be passed to download_file
                        const url = 'api/' + this.props.dataId + '/download_file?file_id=' + result['file_id']
                        let download_filename = ''
                        if (this.props.subsetName == '(all)') {
                            download_filename = this.props.filename.replace('.csv', '') + '_plotplot_export.csv'
                        } else {
                            download_filename = this.props.subsetName + '.csv'
                        }
                        downloadWithFakeClick(url, download_filename)
                    }
                }
            )
    }


    onFilterChange(e) {
        this.setState({
            filter: e.target.value
        })
    }

    clearFilterbox() {
        this.filterBoxRef.current.value = ''
        this.filterBoxRef.current.focus()
        this.setState({
            filter: ''
        })
    }

    handleNonNumericHeaderClick(e) {
        this.setState({
            nonNumericCollapsed: !this.state.nonNumericCollapsed
        })
    }

    handleNumericHeaderClick(e) {
        this.setState({
            numericCollapsed: !this.state.numericCollapsed
        })
    }

    handleClose() {
        this.props.saveCsvCheckboxState(this.state.nonNumericCheckboxState, this.state.numericCheckboxState)
        this.props.hideCsvDialog()
        this.setState({
            showJupyterDialog: false,
            jupyterFileWritten: null,
        })
    }

    shouldComponentUpdate(nextProps, nextState) {
        return this.props.show || nextProps.show;
    }


    render() {

        const resultNonNumeric = this.getRows(this.props.nonNumericCols, this.updateCheckboxStateNonNumeric, this.defaultCheckedNonNumeric)
        const nonNumericRows = resultNonNumeric['rows']
        const visibleNonNumeric = this.state.nonNumericCollapsed ? 0 : resultNonNumeric['visible']

        const resultNumeric = this.getRows(this.props.numericCols, this.updateCheckboxStateNumeric, this.defaultCheckedNumeric)
        const numericRows = resultNumeric['rows']
        const visibleNumeric = this.state.numericCollapsed ? 0 : resultNumeric['visible']

        const dispDownload = this.state.isGenerating ? 'none' : ''
        const dispGenerating = this.state.isGenerating ? '' : 'none'

        let modalContent = <></>
        if (this.state.showJupyterDialog) {
            // Remove the last 4 characters (assumed to be '.csv') from the filename
            const cleanFilename = this.props.filename.slice(0, -4);

            // Get the current date and time
            const now = new Date();
            // Format the date and time as 'YYYYMMDD_HHMMSS'
            const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')
                }${now.getDate().toString().padStart(2, '0')
                }_${now.getHours().toString().padStart(2, '0')
                }${now.getMinutes().toString().padStart(2, '0')
                }${now.getSeconds().toString().padStart(2, '0')
                }`;

            // Construct the default value with the base path from the environment variable,
            // the cleaned filename, and the formatted timestamp
            const defaultFilename = `${cleanFilename}_${timestamp}_plotplot.csv`;

            let codeSection = <>You must write the file first.</>
            if (this.state.jupyterFileWritten) {
                const filepath_hack = this.state.jupyterFileWritten.replace('/kraken_data/', '/mnt/')
                codeSection = (
                    <>
                        <Form.Control as="textarea" readOnly rows={10} ref={this.bulkTextBoxRef} style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }} value={`df_np = pd.read_csv("${filepath_hack}")`} onClick={(e) => { e.target.select() }} />
                    </>
                )
            }

            modalContent = (<>
                <Modal.Header closeButton>
                    <Modal.Title id="csv-export-title">
                        Export to Jupyter Notebook / Python
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div>
                        <h3>1. Export file</h3>
                        <Form onSubmit={(e) => {
                            e.preventDefault();
                            this.writeJupyterFile();
                        }}>
                            <Form.Control
                                style={{ width: '50%', display: 'inline', marginRight: '10px', marginLeft: '20px' }}
                                type="text"
                                ref={this.jupyterFilePathRef}
                                autoComplete="off"  // Disables autofill
                                autoCorrect="off"   // Disables autocorrect on iOS
                                spellCheck="false"  // Disables spell checking
                                autoCapitalize="off" // Disables auto capitalization on iOS
                                defaultValue={defaultFilename}
                            />
                            <Button
                                onClick={this.writeJupyterFile}
                                style={{
                                    marginRight: '5px',
                                    alignItems: 'center',
                                    display: dispDownload,
                                    marginBottom: '3px'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    Write file
                                </div>
                            </Button>
                            <span style={{ display: dispGenerating }}>
                                <Button disabled style={{ marginRight: '5px', alignItems: 'center' }} >
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        Writing file... <Spinner animation="border" style={{ marginLeft: '5px', marginRight: '5px' }} />
                                    </div>
                                </Button>
                            </span>
                        </Form>
                    </div>
                    <hr />
                    <div>
                        <h3>2. Copy code</h3>
                        {codeSection}
                    </div>
                </Modal.Body>
            </>)
        } else {
            let toJupyterButton = (
                <Button
                    variant="outline-secondary"
                    style={{ marginRight: '10px' }}
                    onClick={this.toJupyter}
                >To Jupyter Notebook</Button>
            )
            if (!this.props.backendConfig || !('juypter_export_enabled' in this.props.backendConfig) || !this.props.backendConfig['juypter_export_enabled']) {
                toJupyterButton = <></>
            }

            modalContent = (<>
                <Modal.Header closeButton>
                    <Modal.Title id="csv-export-title">
                        CSV Export: <code>{this.props.subsetName}</code>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ textAlign: 'start', flex: '0 0 auto', whiteSpace: 'nowrap' }}>
                            <Button style={{ marginRight: '5px', display: dispDownload }} onClick={this.downloadCsv} >Download CSV</Button>
                            <span style={{ display: dispGenerating }}>
                                <Button disabled style={{ marginRight: '5px', alignItems: 'center' }} >
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        Generating... <Spinner animation="border" style={{ marginLeft: '5px', marginRight: '5px' }} />
                                    </div>
                                </Button>
                            </span>
                            {toJupyterButton}
                        </span>
                        <span style={{ textAlign: 'end', flex: '1 1 auto', width: '100%', padding: '10px' }}>
                            <Form.Control
                                ref={this.filterBoxRef}
                                type="text"
                                placeholder="filter"
                                autoComplete="off"  // Disables autofill
                                autoCorrect="off"   // Disables autocorrect on iOS
                                spellCheck="false"  // Disables spell checking
                                autoCapitalize="off" // Disables auto capitalization on iOS
                                onChange={this.onFilterChange}
                                style={{ display: 'inline', width: '40%' }}
                            />
                            <Button onClick={this.clearFilterbox} variant="outline-dark" style={{ marginRight: '10px' }}><i className="fas fa-times"></i></Button>
                            <Button onClick={() => this.checkOrUncheckAll(true)} variant="outline-primary" style={{ margin: '5px' }} >Check all visible ({visibleNonNumeric + visibleNumeric})</Button>
                            <Button onClick={() => this.checkOrUncheckAll(false)} variant="outline-primary" >Uncheck all visible ({visibleNonNumeric + visibleNumeric})</Button>
                        </span>
                    </div>

                    <Accordion defaultActiveKey="0" style={{ width: '99%', marginTop: '15px' }}  >
                        <Accordion.Item eventKey="0" >
                            <Accordion.Header onClick={this.handleNonNumericHeaderClick} ref={this.nonNumericRef}>Non-numeric Columns ({this.state.nonNumericChecked} / {this.state.nonNumericTotal} selected)</Accordion.Header>
                            <Accordion.Body style={{ padding: '8px', paddingLeft: '11px' }}>
                                <Table>
                                    <thead>
                                        <tr style={{ borderBottom: 'solid 2px #0d6efd', marginBottom: '10px' }}>
                                            <td colSpan="4"><Button onClick={() => this.checkOrUncheckNonNumeric(true)} variant="outline-primary" style={{ marginRight: '5px' }} >Check all visible</Button><Button onClick={() => this.checkOrUncheckNonNumeric(false)} variant="outline-primary" style={{ margin: '5px' }} >Uncheck all visible</Button></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {nonNumericRows}
                                    </tbody>
                                </Table>
                            </Accordion.Body>
                        </Accordion.Item>
                    </Accordion>
                    <Accordion defaultActiveKey="0" style={{ width: '99%', marginTop: '15px' }} >
                        <Accordion.Item eventKey="0" >
                            <Accordion.Header onClick={this.handleNumericHeaderClick} ref={this.numericRef} >Numeric Columns ({this.state.numericChecked} / {this.state.numericTotal} selected)</Accordion.Header>
                            <Accordion.Body style={{ padding: '8px', paddingLeft: '11px' }}>
                                <Table>
                                    <thead>
                                        <tr style={{ borderBottom: 'solid 2px #0d6efd', marginBottom: '10px' }}>
                                            <td colSpan="4"><Button onClick={() => this.checkOrUncheckNumeric(true)} variant="outline-primary" style={{ marginRight: '5px' }} >Check all visible</Button><Button onClick={() => this.checkOrUncheckNumeric(false)} variant="outline-primary" style={{ margin: '5px' }} >Uncheck all visible</Button></td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {numericRows}
                                    </tbody>
                                </Table>
                            </Accordion.Body>
                        </Accordion.Item>
                    </Accordion>
                    <div style={{ textAlign: 'end' }}>
                        <Button style={{ marginRight: '5px', display: dispDownload }} onClick={this.downloadCsv} >Download CSV</Button>
                        {toJupyterButton}
                        <span style={{ display: dispGenerating }}>
                            <Button disabled style={{ marginRight: '5px', alignItems: 'center' }} >
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    Generating... <Spinner animation="border" style={{ marginLeft: '5px', marginRight: '5px' }} />
                                </div>
                            </Button>
                        </span>
                        <Button style={{ margin: '10px', marginLeft: '5px' }} variant="outline-secondary" onClick={this.handleClose}>Close</Button>
                    </div>
                </Modal.Body>
            </>
            )
        }

        return (
            <Modal
                show={this.props.show}
                onHide={this.handleClose}
                dialogClassName="modal-90w"
                aria-labelledby="example-custom-modal-styling-title"
            >
                {modalContent}
            </Modal>
        )
    }

    componentDidUpdate() {
        this.maybeInitCheckboxState()

        if (!this.state.totalsComputed) {
            this.computeCheckboxTotals()
        }
    }

    componentDidMount() {
    }
}



export { CsvExportDialog };
