import React from 'react';
import { DndProvider } from 'react-dnd'
import { ProgressBar, Spinner, Button, Table, Form, Toast, ToastContainer } from 'react-bootstrap';
import { HTML5Backend } from 'react-dnd-html5-backend'
import { formatDistance } from 'date-fns'
import axios from 'axios';

import { Plotplot } from './Plotplot/Plotplot';
import { ErrorBoundary } from './Plotplot/ErrorBoundary';
import { FileDropBox } from './FileDropBox';
import { nFormatter, matchesSearch, showUserData } from './utility';

import './App.css';

class App extends React.Component {
    constructor(props) {
        super(props);
        this.initialAppState = {
            dataId: null,
            uploadProgress: 0,
            showProgressBars: false,
            uploadLoaded: 0,
            uploadTotal: 0,
            uploadDateStarted: null,
            uploadDateEnded: null,
            filename: '',
            rowsLoaded: null,
            loadingProgress: 0,
            mathDone: 0,
            mathTotal: 0,
            totalRows: null,
            readyToPlot: false,
            knownSessions: [],
            initState: null,
            knownSessionsLoaded: false,
            recentFiles: [],
            recentFilesLoaded: false,
            cloudFiles: [],
            cloudFilesLoaded: false,
            cloudSearch: '',
            name: null,
            email: null,
            profilePicture: null,
            showUploadBar: true,
            isCloud: false,
            cloudLoaded: 0,
            cloudTotal: 0,
            cloudDateStarted: null,
            cloudDateEnded: null,
            cloudProgress: 0,
            cloudInCache: false,
            errorToast: '',
            restrictZoomX: false,
            restrictZoomY: false,
            shiftPressed: false,
            controlPressed: false,
            loadingText: '',
            backendConfig: null,
        };
        this.state = this.initialAppState;
        this.handleUpload = this.handleUpload.bind(this);
        this.handleFileDropped = this.handleFileDropped.bind(this);
        this.doUpload = this.doUpload.bind(this);
        this.getLoadProgress = this.getLoadProgress.bind(this);
        this.resumeSession = this.resumeSession.bind(this);
        this.goBack = this.goBack.bind(this);
        this.getExistingSessions = this.getExistingSessions.bind(this);
        this.getUploadText = this.getUploadText.bind(this);
        this.loadData = this.loadData.bind(this);
        this.getRecentFiles = this.getRecentFiles.bind(this);
        this.useRecentFile = this.useRecentFile.bind(this);
        this.useCloudFile = this.useCloudFile.bind(this);
        this.onCloudSearch = this.onCloudSearch.bind(this);
        this.useFile = this.useFile.bind(this);
        this.getUsername = this.getUsername.bind(this);
        this.closeToast = this.closeToast.bind(this);
        this.handleBlur = this.handleBlur.bind(this)
        this.handleFocus = this.handleFocus.bind(this)
        this.handleKeyPress = this.handleKeyPress.bind(this)
    }

    handleKeyPress(event) {
        const down = event.type == 'keydown'
        if (event.key == 'Control' || event.key == 'Alt') {
            // Restrict scroll wheel zoom to x-axis
            this.setState({
                restrictZoomX: down,
                restrictZoomY: false,
                controlPressed: down,
            })
        } else if (event.key == 'Meta') {
            this.setState({
                restrictZoomX: false,
                restrictZoomY: down,
                controlPressed: down,
            })
        } else if (event.key == 'Shift') {
            this.setState({
                shiftPressed: down,
            })
        }
    }

    handleBlur(event) {
        this.setState({
            restrictZoomX: false,
            restrictZoomY: false,
            controlPressed: false,
            shiftPressed: false,
        })
    }

    handleFocus(event) {
        this.setState({
            restrictZoomX: false,
            restrictZoomY: false,
            controlPressed: false,
            shiftPressed: false,
        })
    }

    handleFileDropped(e) {
        const data = new FormData();
        data.append('file', e.files[0]);

        if (e.files[0].type == "text/csv" || true) {
            this.doUpload(data, e.files[0].name);
        } else {
            this.toastError("Wrong File type");
        }
    }

    handleUpload(ev) {
        ev.preventDefault();

        const data = new FormData();
        data.append('file', this.uploadInput.files[0]);
        if (this.uploadInput.files[0].type == "text/csv") {
            this.doUpload(data, this.uploadInput.files[0].name);
        } else {
            this.toastError("Wrong File type");
        }
    }

    doUpload(data, uploadName) {
        this.setState({
            uploadDateStarted: Date.now()
        })
        axios.request({
            method: "post",
            url: "api/upload",
            data: data,
            onUploadProgress: (p) => {
                this.setState({
                    showProgressBars: true,
                    uploadProgress: p.loaded / p.total,
                    filename: uploadName,
                    uploadLoaded: p.loaded,
                    uploadTotal: p.total,
                })
            }
        }).then(result => {
            if ('error' in result['data']) {
                console.log(result['error'])
                return
            }
            this.setState({
                dataId: result['data']['data_id'],
                uploadDateEnded: Date.now(),
            })
            // Start polling for progress
            setTimeout(this.getLoadProgress, 100);
        })

    }

    getBackendConfig() {
        const localEmail = localStorage.getItem('plotplot-user')
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                localEmail: localEmail,
            })
        }
        fetch("api/config", requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.toastError(result['error'])
                        console.log(result)
                        return
                    }
                    if ('config' in result && result['config']['requires_login'] == false) {
                        if (result['config']['multi_user_mode']) {
                            // Save the generated email to local storage
                            localStorage.setItem('plotplot-user', result['email'])
                            this.setState({
                                backendConfig: result['config'],
                                name: 'User',
                                email: result['email'],
                            }, this.loadData)
                        } else {
                            this.setState({
                                backendConfig: result['config'],
                                name: 'User',
                                email: 'user@plotplot.org',
                            }, this.loadData)
                        }
                    } else {
                        this.setState({
                            backendConfig: result['config'],
                        }, this.loadData)
                    }
                }
            )
    }

    getUsername() {
        fetch("api/username")
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.toastError(result['error'])
                        console.log(result)
                        return
                    }
                    this.setState({
                        name: result['name'],
                        email: result['email'],
                        profilePicture: result['profile_pic'],
                    })
                }
            )
    }

    getLoadProgress() {
        if (this.state.isCloud && this.state.cloudDateEnded == null) {
            fetch("api/cloud_progress?data_id=" + this.state.dataId)
                .then(res => res.json())
                .then(
                    (result) => {
                        if ('error' in result) {
                            this.toastError(result['error']);
                            setTimeout(this.getLoadProgress, 250);
                            return;
                        }
                        if (this.state.cloudDateStarted == null) {
                            this.setState({
                                cloudDateStarted: Date.now(),
                                showUploadBar: true,
                            });
                        }
                        const progress = result['progress']
                        if (result['progress'] == 1) {
                            this.setState({
                                cloudDateEnded: Date.now(),
                                cloudLoaded: result['total_bytes'],
                                cloudTotal: result['total_bytes'],
                                cloudProgress: progress,
                                cloudInCache: result['in_cache'],
                            });
                        } else {
                            this.setState({
                                cloudLoaded: result['downloaded_bytes'],
                                cloudTotal: result['total_bytes'],
                                cloudProgress: progress,
                                cloudInCache: result['in_cache'],
                            });
                        }
                        setTimeout(this.getLoadProgress, 250);
                    }
                )
        } else {
            fetch("api/processing_progress?data_id=" + this.state.dataId)
                .then(res => res.json())
                .then(
                    (result) => {
                        if ('error' in result) {
                            this.toastError(result['error'])
                            setTimeout(this.getLoadProgress, 250);
                            return
                        }
                        if (this.state.processingDateStarted == null) {
                            this.setState({
                                processingDateStarted: Date.now()
                            })
                        }
                        const progress = result['progress']
                        if (result['done']) {
                            this.setState({
                                loadingProgress: progress,
                                readyToPlot: true
                            })
                        } else {
                            const rowsLoaded = result['rows_loaded']
                            const totalRows = result['total_rows']
                            const mathDone = result['math_vars_loaded']
                            const mathTotal = result['math_vars_total']
                            this.setState({
                                loadingProgress: progress,
                                totalRows: totalRows,
                                rowsLoaded: rowsLoaded,
                                mathDone: mathDone,
                                mathTotal: mathTotal,
                                loadingText: result['text'],
                            })
                            setTimeout(this.getLoadProgress, 250);
                        }
                    }
                )
        }
    }

    resumeSession(session) {
        // Immediately set options to get the UI to update
        this.setState({
            showProgressBars: true,
            uploadDateStarted: Date.now(),
            uploadDateEnded: Date.now(),
            uploadProgress: 1,
            showUploadBar: false,
        })

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: session['id'],
            })
        }
        fetch('api/resume_session', requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        console.log(result)
                        this.toastError(result['error'])
                        this.setState({
                            showProgressBars: false,
                            uploadDateStarted: null,
                            uploadDateEnded: null,
                            uploadProgress: 0,
                            showUploadBar: false,
                        })
                        return
                    }
                    let parsed = JSON.parse(result['json_state']);

                    //if json_state is not null/undefined added plotCursorPos variables 
                    parsed = (parsed ? { ...parsed, plotCursorPosX: 0, plotCursorPosY: 0 } : parsed);
                    if (result['file_needs_cloud_download']) {
                        this.setState({
                            initState: parsed,
                            dataId: result['maybe_new_session_id'],
                            filename: result['filename'],
                            uploadDateStarted: Date.now(),
                            uploadDateEnded: Date.now(),
                            showUploadBar: false,
                            showProgressBars: true,
                            uploadProgress: 1,
                            uploadLoaded: 0,
                            uploadTotal: 0,
                            isCloud: true,
                        })
                        // Start polling for progress
                        setTimeout(this.getLoadProgress, 100);
                    } else if (result['file_needs_load']) {
                        this.setState({
                            initState: parsed,
                            dataId: result['maybe_new_session_id'],
                            filename: result['filename'],
                        })
                        // Start polling for progress
                        setTimeout(this.getLoadProgress, 100);

                    } else {
                        this.setState({
                            dataId: result['maybe_new_session_id'],
                            filename: result['filename'],
                            readyToPlot: true,
                            initState: parsed,
                        })
                    }

                }
            )
    }

    useRecentFile(filename, file_size) {
        return this.useFile(filename, file_size, false)
    }

    useExternalFile(filename, file_size) {
        return this.useFile(filename, file_size, false, null, true)
    }

    useCloudFile(filedata) {
        return this.useFile(filedata['name'], filedata['size'], true, filedata['id'])
    }

    useFile(filename, file_size, isCloud, cloudId = null, isExternal = false) {
        let url = ''
        if (isCloud) {
            url = 'api/load_cloud_file'
        } else if (isExternal) {
            url = 'api/load_external_file'
        } else {
            url = 'api/load_recent_file'
        }
        const request_name = isCloud ? cloudId : filename
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: request_name,
            })
        }
        fetch(url, requestOptions)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        console.log(result)
                        this.toastError(result['error'])
                        this.setState({
                            showProgressBars: false,
                            uploadDateStarted: null,
                            uploadDateEnded: null,
                            uploadProgress: 0,
                            showUploadBar: false,
                        })
                        return
                    }
                    this.setState({
                        dataId: result['data_id'],
                        uploadDateStarted: Date.now(),
                        uploadDateEnded: Date.now(),
                        showUploadBar: false,
                        showProgressBars: true,
                        uploadProgress: 1,
                        filename: isExternal ? filename.split('/').pop() : filename,
                        uploadLoaded: file_size,
                        uploadTotal: file_size,
                        isCloud: isCloud,
                    })
                    // Start polling for progress
                    setTimeout(this.getLoadProgress, 100);

                }
            )
    }

    goBack() {
        this.setState(this.initialAppState)
        this.loadData()
    }

    onCloudSearch(e) {
        this.setState({
            cloudSearch: e.target.value
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

    maybeSetUrl() {
        // Set the browser URL to dataId
        if (this.state.dataId != null) {
            const url = process.env.PUBLIC_URL + "/session/" + this.state.dataId
            if (window.location.href.toString() != url) {
                window.history.pushState(null, null, url)
            }
        }
    }

    getLoginUrl() {
        const url_split = window.location.href.toString().split('/session/')
        if (url_split.length > 0) {
            const data_id = url_split[url_split.length - 1]
            if (data_id.length == 36) {
                return 'login?data_id=' + data_id
            } else {
                const url = new URL(window.location.href)
                const filename = new URLSearchParams(window.location.search).get('filename')
                if (url.pathname.endsWith('load_file')) {
                    if (filename !== null && filename.length > 0) {
                        return 'login?filename=' + encodeURIComponent(filename)
                    } else {
                        return 'login'
                    }
                } else {
                    return 'login'
                }
            }
        }
    }

    render() {
        if (this.state.email == null || this.state.email == '') {
            let login_button = <>Connecting to server...</>
            if (this.state.backendConfig && 'requires_login' in this.state.backendConfig && this.state.backendConfig['requires_login']) {
                login_button = <Button href={this.getLoginUrl()}>Login</Button>
            }

            //window.location = "login"
            return (
                <div>
                    <div className="px-4 py-5 text-center">
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', }}>
                            <div style={{ flex: '1 1 auto' }}></div>
                            <img className="d-block mx-auto mb-4" src="icon2.svg" alt="" style={{ height: '150px', flex: '0 1 auto' }} />
                            <div style={{ flex: '0 1 auto', marginLeft: '20px' }}>
                                <h4 style={{textAlign: 'left'}}>Plotplot</h4>
                                <p>by the <a href="https://vector.engineering" target="_blank">Deverman Lab</a></p>
                            </div>
                            <div style={{ flex: '1 1 auto' }}></div>
                        </div>
                        <hr />
                        {login_button}
                    </div>
                </div>
            )

        }

        if (this.state.readyToPlot) {
            this.maybeSetUrl()
            return (<div>
                <ErrorBoundary fallback={<p>Frontend UI error.</p>}>
                    <Plotplot
                        dataId={this.state.dataId}
                        filename={this.state.filename}
                        initState={this.state.initState}
                        goBack={this.goBack}
                        name={this.state.name}
                        email={this.state.email}
                        profilePicture={this.state.profilePicture}
                        restrictZoomX={this.state.restrictZoomX}
                        restrictZoomY={this.state.restrictZoomY}
                        shiftPressed={this.state.shiftPressed}
                        controlPressed={this.state.controlPressed}
                        backendConfig={this.state.backendConfig}

                    />
                </ErrorBoundary>
            </div>)
        }

        let notUploadDisp = this.state.showProgressBars ? 'none' : ''
        const uploadProgressDisp = this.state.showProgressBars && this.state.showUploadBar ? '' : 'none'
        let uploadingOrDownloadingFromCloudText = 'Uploading'
        let uploadProgressText = ''
        let uploadProgressValue = this.state.uploadProgress * 100

        if (this.state.isCloud) {
            uploadingOrDownloadingFromCloudText = 'Downloading from the cloud'
            uploadProgressText = this.getCloudDownloadText()
            uploadProgressValue = this.state.cloudProgress * 100
        } else {
            uploadProgressText = this.getUploadText()
        }

        let spinnerText = this.state.loadingText
        let parsingProgressDisp = 'none'
        let mathProgressDisp = 'none'

        let spinnerDisp = 'none'

        if (this.state.showProgressBars && this.state.uploadDateEnded != null) {
            if (this.state.processingDateStarted == null && (!this.state.isCloud || this.state.cloudDateStarted == null)) {
                spinnerText = 'Creating a process for your session...'
                spinnerDisp = ''
            } else if (this.state.totalRows < 1) {
                if (!this.state.isCloud) {
                    spinnerText = this.state.loadingText
                    spinnerDisp = ''
                }
            } else {
                parsingProgressDisp = ''

                if (this.state.loadingProgress > 0.999 && this.state.mathTotal > 0) {
                    mathProgressDisp = ''
                }
            }
        }



        let dispSessions = this.state.knownSessions.length < 1 ? 'none' : ''
        let dispNoSessions = this.state.knownSessions.length > 0 ? 'none' : ''

        let noSessionsText = this.state.knownSessionsLoaded ? 'No saved sessions found.' : 'Loading...'

        // Compute rows for restoring sessions
        let sessions = []
        for (let session of this.state.knownSessions) {
            sessions.push(<tr key={session['id']} style={{ overflowWrap: 'anywhere' }}><td>{formatDistance(new Date(session['updated'] * 1e3), new Date()) + ' ago'}</td><td>{session['filename']}</td><td><Button style={{ whiteSpace: 'nowrap' }} onClick={() => this.resumeSession(session)}>Resume</Button></td></tr>)
        }

        let rowsData = ''
        if (this.state.totalRows != null && this.state.totalRows > 0 && this.state.rowsLoaded != null) {
            rowsData = ' | ' + nFormatter(this.state.rowsLoaded) + ' / ' + nFormatter(this.state.totalRows) + ' rows'
        }

        let recentFiles = []
        // Files come as an array of [name, size in bytes]
        for (let i = 0; i < this.state.recentFiles.length; i++) {
            let fileData = this.state.recentFiles[i]
            recentFiles.push(
                <tr key={fileData[0]}><td className="text-start" style={{ overflowWrap: 'anywhere' }}>{fileData[0]}</td><td>{this.formatBytes(fileData[1])}</td><td><Button variant="outline-primary" onClick={() => this.useRecentFile(fileData[0], fileData[1])}>Load</Button></td></tr>
            )
        }

        let cloudFiles = []
        // Files come as an array of [name, size in bytes]
        for (let i = 0; i < this.state.cloudFiles.length; i++) {
            let fileData = this.state.cloudFiles[i]
            if (matchesSearch(fileData['name'], this.state.cloudSearch)) {
                cloudFiles.push(
                    <tr key={fileData['id']}><td className="text-start" style={{ overflowWrap: 'anywhere' }}>{fileData['name']}</td><td>{this.formatBytes(fileData['size'])}</td><td><Button variant="outline-primary" onClick={() => this.useCloudFile(fileData)}>Load</Button></td></tr>
                )
            }
        }
        if (this.state.cloudFiles.length < 1) {
            cloudFiles.push(
                <tr key="loading"><td className="text-start" style={{ overflowWrap: 'anywhere' }}>Loading...</td><td></td><td></td></tr>
            )
        } else if (cloudFiles.length < 1) {
            cloudFiles.push(
                <tr key="no_results"><td className="text-start" style={{ overflowWrap: 'anywhere' }}>No results</td><td></td><td></td></tr>
            )
        }

        const errorToast = this.state.errorToast
        const showToast = errorToast.length == 0 ? false : true

        let user_data = <></>
        if (showUserData(this.state.email)) {
            user_data = <><img style={{ width: 30, borderRadius: 30, marginRight: '8px' }} src={this.state.profilePicture} /> {this.state.name} (<a href="logout">logout</a>)</>
        }

        let loadFromTheCloud = (<>
            <h4 className="display-7">or load from the cloud:</h4>
            <Table striped className="table">
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Size</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colSpan="3"><Form.Control type="text" placeholder="filter: data*.csv" onChange={this.onCloudSearch} /></td></tr>
                    {cloudFiles}
                </tbody>
            </Table>
        </>)

        let useRecentFile = (<>
            <h4 className="display-7">or use a recent file:</h4>
            <Table striped className="table">
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>Size</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {recentFiles}
                </tbody>
            </Table>
        </>)

        let bottomLeft = useRecentFile
        let bottomRight = <></>

        if (this.state.backendConfig && 'google_drive_enabled' in this.state.backendConfig && this.state.backendConfig['google_drive_enabled']) {
            bottomLeft = loadFromTheCloud
            bottomRight = useRecentFile
        }

        return (
            <div>
                <div style={{ textAlign: 'end', padding: '10px', display: 'flex', justifyContent: 'end', alignItems: 'center' }}>
                    {user_data}
                </div>
                <DndProvider backend={HTML5Backend}>
                    <div className="px-4 py-5 text-center">
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', }}>
                            <div style={{ flex: '1 1 auto' }}></div>
                            <img className="d-block mx-auto mb-4" src="icon2.svg" alt="" style={{ height: '150px', flex: '0 1 auto' }} />
                            <div style={{ flex: '0 1 auto', marginLeft: '20px' }}>
                                <h4 style={{textAlign: 'left'}}>Plotplot</h4>
                                <p>by the <a href="https://vector.engineering" target="_blank">Deverman Lab</a></p>
                            </div>
                            <div style={{ flex: '1 1 auto' }}></div>
                        </div>
                        <hr />
                        <div style={{ display: notUploadDisp }}>
                            <div style={{ display: 'flex' }}>
                                <div style={{ marginLeft: '20px', marginRight: '20px', width: '50%' }}>
                                    <h4 className="display-6 ">Upload a .csv or .h5ad</h4>
                                    <div className="mx-auto">
                                        <Form className='d-flex' style={{ marginBottom: '5px', marginTop: '20px' }}>
                                            <Form.Control accept="text/csv, .h5ad" type="file" ref={(ref) => { this.uploadInput = ref; }} />
                                            <Button style={{ marginLeft: '5px' }} onClick={this.handleUpload}>Upload</Button>
                                        </Form>
                                        <p></p>
                                        <div style={{ marginTop: '5px' }}>
                                            <FileDropBox name="fileDrop" onDrop={this.handleFileDropped} />
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '5px' }}>
                                        {bottomLeft}
                                    </div>
                                </div>
                                <div style={{ width: '50%', borderLeft: 'solid 1px' }}>
                                    <h4 className="display-7 ">Resume a session</h4>
                                    <div className="table-responsive" style={{ margin: '10px', display: dispSessions }}>
                                        <Table striped className="table table-responsive">
                                           <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>Filename</th>
                                                    <th></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sessions}
                                            </tbody>
                                        </Table>
                                    </div>
                                    <div style={{ margin: '10px', display: dispNoSessions }}>
                                        <p>{noSessionsText}</p>
                                    </div>
                                    <div style={{ margin: '20px' }}>
                                        {bottomRight}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: uploadProgressDisp, paddingLeft: '5%', paddingRight: '5%', paddingTop: '30px' }}>
                            {uploadingOrDownloadingFromCloudText} <code>{this.state.filename}</code>...
                            <ProgressBar now={uploadProgressValue} style={{ margin: '10px' }} />
                            <h4 style={{ marginTop: '5px', fontFamily: 'monospace' }}>{uploadProgressText}</h4>
                        </div>

                        <div style={{ display: spinnerDisp }}>
                            <div style={{ paddingBottom: '10px', paddingTop: '15px' }}>
                                {spinnerText}
                            </div>
                            <div>
                                <Spinner animation="border" variant="secondary" />
                            </div>
                        </div>

                        <div style={{ display: parsingProgressDisp, paddingLeft: '5%', paddingRight: '5%', paddingTop: '30px' }}>
                            Parsing CSV...
                            <ProgressBar now={this.state.loadingProgress * 100} style={{ margin: '10px' }} />
                            <h4 style={{ marginTop: '5px', fontFamily: 'monospace' }}>{(this.state.loadingProgress * 100).toFixed(0)}% {rowsData}</h4>
                        </div>

                        <div style={{ display: mathProgressDisp, paddingLeft: '5%', paddingRight: '5%', paddingTop: '30px' }}>
                            Restoring math variables...
                            <ProgressBar now={this.state.mathDone / this.state.mathTotal * 100} style={{ margin: '10px' }} />
                            <h4 style={{ marginTop: '5px', fontFamily: 'monospace' }}>{(this.state.mathDone)} / {this.state.mathTotal}</h4>
                        </div>

                    </div>
                </DndProvider>
                <ToastContainer className="p-3" position="bottom-center" containerPosition="fixed">
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
            </div>
        )
    }

    getUploadText() {
        const endDate = this.state.uploadDateEnded == null ? Date.now() : this.state.uploadDateEnded
        const bytesPerSec = this.state.uploadLoaded / (endDate - this.state.uploadDateStarted) * 1000

        if (!isFinite(bytesPerSec)) {
            return (this.state.uploadProgress * 100).toFixed(0) + '%'
        }

        return ((this.state.uploadProgress * 100).toFixed(0) + '% | ' + this.formatBytes(this.state.uploadLoaded) + ' / ' + this.formatBytes(this.state.uploadTotal) + ' (' + this.formatBytes(bytesPerSec) + ' / sec)')
    }

    getCloudDownloadText() {
        if (this.state.cloudInCache) {
            return 'File in cache'
        }
        const endDate = this.state.cloudDateEnded == null ? Date.now() : this.state.cloudDateEnded
        const bytesPerSec = this.state.cloudLoaded / (endDate - this.state.cloudDateStarted) * 1000

        if (!isFinite(bytesPerSec)) {
            return (this.state.cloudProgress * 100).toFixed(0) + '%'
        }

        return ((this.state.cloudProgress * 100).toFixed(0) + '% | ' + this.formatBytes(this.state.cloudLoaded) + ' / ' + this.formatBytes(this.state.cloudTotal) + ' (' + this.formatBytes(bytesPerSec) + ' / sec)')
    }

    formatBytes(bytes, decimals = null) {
        if (bytes === 0) return '0 bytes';

        const k = 1024;
        const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        if (decimals == null) {
            if (sizes[i] == 'GB') {
                decimals = 1
            } else {
                decimals = 0
            }
        }
        const dm = decimals < 0 ? 0 : decimals;

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    loadData() {
        this.getUsername()
        this.getExistingSessions()
        this.getRecentFiles()
        this.getCloudFiles()

        // Load URL parameters
        if (window.location.pathname != '' && window.location.pathname != '/') {
            let session = Object()
            session['filename'] = ''

            const loc = window.location.pathname.split('/')
            if (loc[loc.length - 2] == 'session') {
                session['id'] = loc[loc.length - 1]

                // UUIDs are 36 characters long
                if (session['id'].length == 36) {
                    this.resumeSession(session)
                }
            } else if (loc[loc.length - 1] == 'load_file') {
                const filename = new URLSearchParams(window.location.search).get('filename')
                if (filename !== null && filename.length > 0) {
                    this.useExternalFile(filename, 0)
                }
            }
        }
    }

    getExistingSessions() {
        // Look for existing sessions
        fetch("api/sessions")
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.setState({
                            knownSessionsLoaded: true,
                        })
                        return
                    }
                    this.setState({
                        knownSessions: result,
                        knownSessionsLoaded: true,
                    })
                }
            )
    }

    getRecentFiles() {
        fetch("api/recent_files")
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.setState({
                            recentFilesLoaded: true,
                        })
                        return
                    }

                    this.setState({
                        recentFiles: result,
                        recentFilesLoaded: true,
                    })
                }
            )
    }

    getCloudFiles() {
        fetch("api/cloud_files")
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        this.setState({
                            cloudFilesLoaded: true,
                        })
                        return
                    }

                    this.setState({
                        cloudFiles: result,
                        cloudFilesLoaded: true,
                    })
                }
            )
    }

    componentDidMount() {
        this.getBackendConfig()
        window.addEventListener('keydown', this.handleKeyPress);
        window.addEventListener('keyup', this.handleKeyPress);
        window.addEventListener('blur', this.handleBlur);
        window.addEventListener('focus', this.handleFocus);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyPress);
        window.removeEventListener('keyup', this.handleKeyPress);
        window.removeEventListener('blur', this.handleBlur);
        window.removeEventListener('focus', this.handleFocus);
    }

}



export default App;



