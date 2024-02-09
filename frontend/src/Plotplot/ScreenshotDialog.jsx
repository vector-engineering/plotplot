import React from 'react';
import Plotly from 'custom-plotly.js';
import { Form, Modal, Button, ButtonGroup, ToggleButton, Spinner } from 'react-bootstrap';
import { getSubsetIds, getMarkerColor, shouldShowColorbar, nanPlotsShown, getPlotWidthHeightPxUtil } from './PlotGroup/PlotGroupUtils'
import { prepPlot } from './PlotGroup/PrepPlot';
import { downloadWithFakeClick } from '../utility';

import { Split } from '@geoffcox/react-splitter';
import Measure from 'react-measure'

// customizable method: use your own `Plotly` object
import createPlotlyComponent from 'react-plotly.js/factory';
const Plot = createPlotlyComponent(Plotly);

function computeBestDimensions(ratio, maxWidth, maxHeight) {
    // Calculate height from the maximum width based on aspect ratio
    let heightFromMaxWidth = maxWidth * (1 / ratio);

    // Calculate width from the maximum height based on aspect ratio
    let widthFromMaxHeight = maxHeight * (ratio);

    // Determine the best width and height
    let width, height;

    if (heightFromMaxWidth <= maxHeight) {
        // If the calculated height fits within the max height, use maxWidth
        width = maxWidth;
        height = heightFromMaxWidth;
    } else {
        // Otherwise, use the dimensions calculated from maxHeight
        width = widthFromMaxHeight;
        height = maxHeight;
    }

    return { width, height };
}

function measureText(txt, font, size) {
        let element = document.createElement('canvas');
        let context = element.getContext("2d");
        context.font = size-4 + 'pt ' + font;
        return context.measureText(txt);
    }

function createAnnotationForTrace(text, color, size, x_offset, y_offset) {
    let font = 'Arial'
    const textMetrics = measureText(text, font, size)
    let width = textMetrics.width
    let height = textMetrics.fontBoundingBoxAscent + textMetrics.fontBoundingBoxDescent
    // let width = 200
    // let height = 100

    // Add some padding inside the colors
    width = width + 8

    let borderpad = 4

    let annotation = {
        xref: 'paper',
        yref: 'paper',
        x: 0,
        xshift: x_offset,
        width: width,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        yshift: y_offset,
        text: text,
        showarrow: false,
        font: {
            family: font,
            size: size,
            color: 'black'
        },
        bgcolor: color, // Semi-transparent orange background
        bordercolor: color,
        borderwidth: 1,
        borderpad: borderpad,
    }

    const padding = borderpad + borderpad + 8

    return { width: width + padding, height: height, annotation: annotation }
}

function layoutAnnotations(annotations, plotWidth, left_or_right, legendMarginTop) {
    // Layout algorithm:
    // 1. Compute number of rows needed
    // 2. If from left, start layout, wrapping as needed
    // 3. If from right, start layout at end wrapping as needed

    let totalWidth = 0
    let rowHeight = 0
    for (let annot of annotations) {
        totalWidth = totalWidth + annot['width']
        rowHeight = Math.max(rowHeight, annot['height'])
    }

    const leftPad = 8
    const rowPadding = 16

    rowHeight = rowHeight + rowPadding

    let x_val = leftPad
    let y_val = legendMarginTop

    let out = []

    if (left_or_right == 'left') {
        for (let annot of annotations) {
            if (x_val + annot['width'] > plotWidth) {
                x_val = leftPad
                y_val = y_val - rowHeight
            }

            annot['annotation'].xshift = x_val
            annot['annotation'].yshift = y_val
            out.push(annot['annotation'])

            x_val = x_val + annot['width']
        }
    } else if (left_or_right == 'right') {
        // Sort annotations into various rows
        let rows = [[]]
        x_val = leftPad
        for (let i = 0; i < annotations.length; i++) {
            let annot = annotations[i]
            if (x_val + annot['width'] > plotWidth) {
                rows.push(Array())
                x_val = leftPad
            }
            rows[rows.length - 1].push(annot)
            x_val = x_val + annot['width']
        }

        // For each row, put the elements in backwards
        for (let row_num = 0; row_num < rows.length; row_num++) {
            x_val = plotWidth
            y_val = legendMarginTop - rowHeight * row_num

            let row = rows[row_num]

            for (let i = row.length - 1; i >= 0; i--) {
                let annot = row[i]
                annot['annotation'].xshift = x_val - annot['width']
                annot['annotation'].yshift = y_val
                out.push(annot['annotation'])

                x_val = x_val - annot['width']
            }
        }
    } else {
        console.error(`Unknown legend location: ${left_or_right}`)
    }

    return out
}

class ScreenshotDialog extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            copied: false,
            screenshotGenerating: false,
            measuredPlotWidth: 0,
            measuredPlotHeight: 0,
            screenshotFileType: '',
        }

        this.splitValueTimeoutId = null;
        this.splitValueTimeoutId2 = null;


        this.screenshotPlotDivRef = React.createRef();
        this.plotContainerRef = React.createRef();
        this.dimensionRefX = React.createRef();
        this.dimensionRefY = React.createRef();

        this.generateScreenshotImage = this.generateScreenshotImage.bind(this)
        this.getScreenshotFilename = this.getScreenshotFilename.bind(this)
        this.setAspectRatio = this.setAspectRatio.bind(this)
        this.userRequestsDimensionChange = this.userRequestsDimensionChange.bind(this)
        this.setExportResolutionMultiplier = this.setExportResolutionMultiplier.bind(this)


    }

    getScreenshotFilename() {
        const farray = this.props.filename.split('.');
        return farray.slice(0, farray.length - 1) + '_' + this.props.plotState.xAxis + '_vs_' + this.props.plotState.yAxis;
    }

    generateScreenshotImage(file_type) {
        if (file_type != 'png' && file_type != 'svg') {
            console.log(`Unknown file_type: ${file_type}`)
            return
        }
        this.setState({
            screenshotGenerating: true,
            screenshotFileType: file_type,
        })

        /* See componentDidUpdate() for the actual download (has to do with SVG rendering). */
    }

    componentDidUpdate(prevProps, prevState) {
        /*
         * This is a bit complicated.  When rendering an SVG, we might want to render each point as a real SVG object.  To do that, we need
         * to be in 'scatter' mode, not 'scattergl'.  But that mode is expensive, so we don't want to leave the plot in that mode all the time.
         * The result is that we swap to 'scatter', wait for the DOM to update, then tell Plotly to grab the image, and swap back.
         * 
         * That's why this function is in componentDidUpdate instead of in generateScreenshotImage()
         */
        if (!prevState.screenshotGenerating && this.state.screenshotGenerating) {
            const file_type = this.state.screenshotFileType
            console.log(`Generating screenshot!! ${file_type}`)
            const farray = this.props.filename.split('.');
            const filename = farray.slice(0, farray.length - 1) + '_' + this.props.plotState.xAxis + '_vs_' + this.props.plotState.yAxis;

            const screenshotState = this.props.screenshotState
            setTimeout( () => {
                Plotly.toImage('plotDivId-screenshotPlot',
                    { format: file_type, filename: filename, width: Math.round(this.state.measuredPlotWidth) * screenshotState.exportResolutionMultiplier, height: Math.round(this.state.measuredPlotHeight) * screenshotState.exportResolutionMultiplier, filename }
                ).then((dataUrl) => {
                    fetch(dataUrl).then(response => {
                        response.blob().then(blob => {
                            downloadWithFakeClick(URL.createObjectURL(blob), filename + '.' + file_type)
                            this.setState({
                                screenshotGenerating: false,
                            })
                        });
                    });
                });
            }, 5);
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        if (!this || !('props' in this) || !this.props || !('show' in this.props) || !nextProps || !('show' in nextProps)) {
            return false
        }
        return this.props.show || nextProps.show;
    }

    setAspectRatio(ratio) {
        const boundingReact = this.plotContainerRef.current.getBoundingClientRect()
        const maxWidth = boundingReact.width
        const maxHeight = boundingReact.height

        let { width, height } = computeBestDimensions(ratio, maxWidth, maxHeight)
        console.log(`${width} x ${height}`)

        this.props.setScreenshotState({
            forcePlotWidth: width,
            forcePlotHeight: height,
        })
    }

    userRequestsDimensionChange(e) {
        const x = this.dimensionRefX.current.value;
        const y = this.dimensionRefY.current.value;

        console.log(parseInt(y))

        this.props.setScreenshotState({
            forcePlotWidth: parseInt(x),
            forcePlotHeight: parseInt(y),
        })
    }

    setExportResolutionMultiplier(val) {
        this.props.setScreenshotState({
            exportResolutionMultiplier: val,
        })
    }

    render() {
        if (!this.props.plotState || !('subsetsSelected' in this.props.plotState)) {
            return <></>
        }
        const subset_ids = getSubsetIds(this.props.plotState.subsetsSelected)
        let totalPoints = 0
        for (let id of subset_ids) {
            totalPoints = totalPoints + this.props.subsets[id]['count']
        }
        let svg_render_mode = 'scattergl'
        if (totalPoints < 40000) {
            svg_render_mode = 'scatter'
        }


        const screenshotState = this.props.screenshotState
        let screenshotBody = null
        if (this.props.show && this.props.plotState) {

            let { graphJson, reordered_data, layout } = prepPlot(this.props.plotState['graphJson'], this.props.plotState, this.props.subsets, this.props.restrictZoomX, this.props.restrictZoomY, this.props.subsetOrder)

            // Deep-copy layout so the changes don't modify the base graph.
            layout = JSON.parse(JSON.stringify(layout));

            const gridColor = '#EBF0F8'
            const zeroLineColor = '#d7dce4'
            const bgColor = '#ffffff'

            let zeroLineX = null
            let zeroLineWidthX = null
            let zeroLineY = null
            let zeroLineWidthY = null

            if (screenshotState.zeroLineX) {
                zeroLineX = zeroLineColor
                zeroLineWidthX = 2
            } else {
                if (screenshotState.showGridX) {
                    zeroLineX = gridColor
                    zeroLineWidthX = 1
                } else {
                    zeroLineX = bgColor
                    zeroLineWidthX = 0
                }
            }

            if (screenshotState.zeroLineY) {
                zeroLineY = zeroLineColor
                zeroLineWidthY = 2
            } else {
                if (screenshotState.showGridY) {
                    zeroLineY = gridColor
                    zeroLineWidthY = 1
                } else {
                    zeroLineY = bgColor
                    zeroLineWidthY = 0
                }
            }

            // Set font sizes
            if (nanPlotsShown(layout)) {
                layout.xaxis.title.font = { size: screenshotState.axisLabelFontSize }
                layout.yaxis.title.font = { size: screenshotState.axisLabelFontSize }

                layout.xaxis4.title.font = { size: screenshotState.axisLabelFontSize }
                layout.yaxis4.title.font = { size: screenshotState.axisLabelFontSize }
                layout.xaxis3.title.font = { size: screenshotState.axisLabelFontSize }
                layout.yaxis3.title.font = { size: screenshotState.axisLabelFontSize }

                layout.xaxis.tickfont = { size: screenshotState.axisTickFontSize }
                layout.yaxis.tickfont = { size: screenshotState.axisTickFontSize }

                layout.xaxis4.tickfont = { size: screenshotState.axisTickFontSize }
                layout.yaxis4.tickfont = { size: screenshotState.axisTickFontSize }
                layout.xaxis3.tickfont = { size: screenshotState.axisTickFontSize }
                layout.yaxis3.tickfont = { size: screenshotState.axisTickFontSize }

                layout.xaxis.showgrid = screenshotState.showGridX
                layout.yaxis.showgrid = screenshotState.showGridY
                layout.xaxis3.showgrid = screenshotState.showGridX
                layout.yaxis3.showgrid = screenshotState.showGridY
                layout.xaxis4.showgrid = screenshotState.showGridX
                layout.yaxis4.showgrid = screenshotState.showGridY

            } else {
                layout.xaxis.title.font = { size: screenshotState.axisLabelFontSize }
                layout.yaxis.title.font = { size: screenshotState.axisLabelFontSize }

                layout.xaxis.tickfont = { size: screenshotState.axisTickFontSize }
                layout.yaxis.tickfont = { size: screenshotState.axisTickFontSize }

                layout.xaxis.showgrid = screenshotState.showGridX
                layout.yaxis.showgrid = screenshotState.showGridY

                layout.xaxis.zerolinecolor = zeroLineX
                layout.yaxis.zerolinecolor = zeroLineY
                layout.xaxis.zerolinewidth = zeroLineWidthX
                layout.yaxis.zerolinewidth = zeroLineWidthY
            }


            layout.margin = { 'autoexpand': true, t: parseInt(screenshotState.legendMarginTop) + 10 }
            layout.dragmode = false

            for (let i = 0; i < reordered_data.length; i++) {
                if (this.state.screenshotGenerating && this.state.screenshotFileType == 'svg' && reordered_data[i].type == 'scattergl') {
                    // Deep-copy so the changes don't modify the base graph.
                    reordered_data = JSON.parse(JSON.stringify(reordered_data));
                    reordered_data[i].type = svg_render_mode
                }
            }

            // Setup a legend
            let annotaions_init = []
            let annotations = []
            if (screenshotState.showLegend) {
                for (let i in graphJson.data) {
                    if (!nanPlotsShown(graphJson.layout) || graphJson.data[i].xaxis == 'x3') { // don't mess with NaN colors

                        let subset_text = ''
                        if (screenshotState.showSubsetCounts) {
                            subset_text = this.props.plotState.subsetsSelected[i]['label']
                        } else {
                            subset_text = this.props.subsets[subset_ids[i]]['name']
                        }

                        const subset_color = getMarkerColor(this.props.subsets, this.props.plotState.subsetsSelected[i]['value'])

                        annotaions_init.push(createAnnotationForTrace(subset_text, subset_color, screenshotState.legendLabelFontSize, 0, 0))
                    }
                }

                // Once we have created all of the annotaions for the legend, we can lay them out.
                let [plotWidth, plotHeight] = getPlotWidthHeightPxUtil('plotDivId-screenshotPlot', nanPlotsShown(layout))
                if (plotWidth > 0) {
                    annotations = layoutAnnotations(annotaions_init, plotWidth, screenshotState.legendLocation, screenshotState.legendMarginTop)
                }
            }
            layout.annotations = annotations

            if (shouldShowColorbar(this.props.plotState.graphJson, this.props.plotState.zAxis)) {
                let text = ''
                if (!this.props.plotState.zAxis || this.props.plotState.zAxis == '') {
                    text = 'Density'
                } else {
                    text = this.props.plotState.zAxis
                }
                layout.annotations.push(
                    {
                        xref: 'paper',
                        yref: 'paper',
                        x: 1,
                        xshift: 70,
                        xanchor: 'right',
                        xpad: 10.4,
                        y: 1,
                        yanchor: 'bottom',
                        ypad: 0,
                        yshift: -40,
                        text: text,
                        showarrow: false,
                        font: {
                            size: screenshotState.axisLabelFontSize,
                            color: 'black'
                        },
                    }
                )
            }
            // console.log(reordered_data)
            // console.log(layout)

            const usedHeight2 = screenshotState.forcePlotHeight ? screenshotState.forcePlotHeight : '75vh'
            screenshotBody = (
                <Plot
                    name="screenshot_plot"
                    data={reordered_data}
                    layout={layout}
                    divId={'plotDivId-screenshotPlot'}
                    config={{
                        scrollZoom: false,
                        displaylogo: false,
                        responsive: true,
                        displayModeBar: false,
                        doubleClick: 'false',
                    }}
                    style={{ height: usedHeight2 }}
                // onRelayout={this.handlePanZoom}
                // onDoubleClick={this.handleDoubleClick}
                />
            )
        }

        const setScreenshotState = this.props.setScreenshotState

        let usedWidth = screenshotState.forcePlotWidth ? screenshotState.forcePlotWidth : ''
        let usedHeight = screenshotState.forcePlotHeight ? screenshotState.forcePlotHeight : ''

        const currentAspectRatio = this.state.measuredPlotWidth / this.state.measuredPlotHeight

        let downloadButtonDisp = this.state.screenshotGenerating ? 'none' : ''
        let downloadSpinnerVis = this.state.screenshotGenerating ? '' : 'hidden'

        const raster_mode_text = svg_render_mode == 'scattergl' ? ' (raster points)' : ''

        return (
            <Modal
                show={this.props.show}
                onHide={(e) => this.props.hideScreenshotDialog()}
                dialogClassName="modal-90w"
                aria-labelledby="example-custom-modal-styling-title2"
            >
                <Modal.Header closeButton>
                    <Modal.Title>
                        <div style={{ display: 'flex', alignItems: 'center', }}>
                            Download:
                            <div style={{ display: downloadButtonDisp }}>
                                <Button
                                    variant="outline-primary"
                                    style={{ margin: '5px' }}
                                    onClick={() => { this.generateScreenshotImage('png') }}
                                >
                                    .png
                                </Button>
                                <Button
                                    variant="outline-primary"
                                    style={{ margin: '5px' }}
                                    onClick={() => { this.generateScreenshotImage('svg') }}
                                >
                                    .svg{raster_mode_text}
                                </Button>
                            </div>
                            <div style={{ visibility: downloadSpinnerVis }}>
                                <Spinner animation="border" variant="secondary" style={{ marginLeft: '20px', marginTop: '10px' }} />
                            </div>
                        </div>
                    </Modal.Title>
                </Modal.Header>

                <div style={{ height: '80vh', margin: '10px', marginBottom: '20px' }}>

                    <Split initialPrimarySize={screenshotState.lastSplitValue} minSecondarySize="10%" onSplitChanged={(e) => {
                        if (e == screenshotState.lastSplitValue) {
                            // initial load
                            return
                        }
                        if (screenshotState.forcePlotWidth || screenshotState.forcePlotHeight) {
                            this.props.setScreenshotState({
                                forcePlotWidth: null,
                                forcePlotHeight: null,
                            })
                        }
                        // We don't want to set this value too often because it really slows things down.
                        // Clear the existing timeout to prevent it from setting the state
                        if (this.splitValueTimeoutId !== null) {
                            clearTimeout(this.splitValueTimeoutId);
                        }
                        this.splitValueTimeoutId = setTimeout(() => {
                            this.props.setScreenshotState({
                                lastSplitValue: e,
                            });

                            // Clear the timeoutId after the state is set
                            this.splitValueTimeoutId = null;
                        }, 500);
                    }}>
                        <div style={{ margin: '10px', marginBottom: '20px', width: '100%', height: '100%' }} className="screenshotPlotDiv" ref={this.plotContainerRef}>
                            <Measure
                                bounds
                                onResize={contentRect => {
                                    // We don't want to set this value too often because it really slows things down.
                                    // Clear the existing timeout to prevent it from setting the state
                                    if (this.splitValueTimeoutId2 !== null) {
                                        clearTimeout(this.splitValueTimeoutId2);
                                    }
                                    this.splitValueTimeoutId2 = setTimeout(() => {
                                        this.setState({
                                            measuredPlotWidth: contentRect.bounds.width,
                                            measuredPlotHeight: contentRect.bounds.height,
                                        })

                                        // Clear the timeoutId after the state is set
                                        this.splitValueTimeoutId2 = null;
                                    }, 500);
                                    
                                    if (this.dimensionRefX.current) {
                                        this.dimensionRefX.current.value = screenshotState.forcePlotWidth ? Math.round(screenshotState.forcePlotWidth) : Math.round(contentRect.bounds.width)
                                    }
                                    if (this.dimensionRefY.current) {
                                        this.dimensionRefY.current.value = screenshotState.forcePlotHeight ? Math.round(screenshotState.forcePlotHeight) : Math.round(contentRect.bounds.height)
                                    }
                                }}
                            >
                                {({ measureRef }) => (
                                    <div ref={measureRef} style={{ width: usedWidth, height: usedHeight }} >
                                        {screenshotBody}
                                    </div>
                                )}
                            </Measure>
                        </div>
                        <div style={{ overflowX: 'hidden', overflowY: 'scroll', maxHeight: '100%' }}>
                            {/* Second part of the split, where settings are */}
                            <div style={{ margin: '10px' }}>
                                <strong>Size</strong>
                                <div style={{ display: 'flex', alignItems: 'center', }}>
                                    Dimensions:
                                    <Form.Control
                                        type="text"
                                        style={{ margin: '10px' }}
                                        ref={this.dimensionRefX}
                                        onBlur={(e) => {
                                            this.userRequestsDimensionChange(e.target.value)
                                        }}
                                        onKeyUp={(e) => {
                                            if (e.key === 'Enter') {
                                                this.userRequestsDimensionChange(e.target.value)
                                            }
                                        }}
                                        onChange={(e) => {
                                            // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                            // change events.
                                            if (this.dimWidthTimeout != null) {
                                                clearTimeout(this.dimWidthTimeout)
                                            }
                                            this.dimWidthTimeout = setTimeout(() => {
                                                this.userRequestsDimensionChange(e.target.value)
                                            }, 1000)
                                        }}
                                    />
                                    x
                                    <Form.Control
                                        type="text"
                                        style={{ margin: '10px' }}
                                        ref={this.dimensionRefY}
                                        onBlur={(e) => {
                                            this.userRequestsDimensionChange(e.target.value)
                                        }}
                                        onKeyUp={(e) => {
                                            if (e.key === 'Enter') {
                                                this.userRequestsDimensionChange(e.target.value)
                                            }
                                        }}
                                        onChange={(e) => {
                                            // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                            // change events.
                                            if (this.dimHeightTimeout != null) {
                                                clearTimeout(this.dimHeightTimeout)
                                            }
                                            this.dimHeightTimeout = setTimeout(() => {
                                                this.userRequestsDimensionChange(e.target.value)
                                            }, 1000)
                                        }}
                                    />
                                </div>
                                {/* <div style={{ display: 'flex', alignItems: 'center', }}>
                                    Download resolution:
                                    <ButtonGroup style={{ marginLeft: '10px' }}>
                                        <GeneralToggleButton
                                            label="1x"
                                            currentValue={screenshotState.exportResolutionMultiplier}
                                            buttonValue={1}
                                            callback={this.setExportResolutionMultiplier}
                                            height="26px"
                                            useApprox={false}
                                            buttonVariant="primary"
                                        />
                                        <GeneralToggleButton
                                            label="2x"
                                            currentValue={screenshotState.exportResolutionMultiplier}
                                            buttonValue={2}
                                            callback={this.setExportResolutionMultiplier}
                                            height="26px"
                                            useApprox={false}
                                            buttonVariant="primary"
                                        />
                                        <GeneralToggleButton
                                            label="3x"
                                            currentValue={screenshotState.exportResolutionMultiplier}
                                            buttonValue={3}
                                            callback={this.setExportResolutionMultiplier}
                                            height="26px"
                                            useApprox={false}
                                            buttonVariant="primary"
                                        />
                                        <GeneralToggleButton
                                            label="4x"
                                            currentValue={screenshotState.exportResolutionMultiplier}
                                            buttonValue={4}
                                            callback={this.setExportResolutionMultiplier}
                                            height="26px"
                                            useApprox={false}
                                            buttonVariant="primary"
                                        />
                                    </ButtonGroup>
                                </div>
                                <br /> */}
                                <div style={{ display: 'flex', alignItems: 'center', }}>
                                    Aspect ratio:
                                    <ButtonGroup style={{ marginLeft: '10px' }}>
                                        <GeneralToggleButton
                                            label="1:1"
                                            currentValue={currentAspectRatio}
                                            buttonValue={1}
                                            callback={this.setAspectRatio}
                                            height="26px"
                                            useApprox={true}
                                            buttonVariant="secondary"
                                        />
                                        <GeneralToggleButton
                                            label="16:9"
                                            currentValue={currentAspectRatio}
                                            buttonValue={16 / 9}
                                            callback={this.setAspectRatio}
                                            height="26px"
                                            useApprox={true}
                                            buttonVariant="secondary"
                                        />
                                        <GeneralToggleButton
                                            label="4:3"
                                            currentValue={currentAspectRatio}
                                            buttonValue={4 / 3}
                                            callback={this.setAspectRatio}
                                            height="26px"
                                            useApprox={true}
                                            buttonVariant="secondary"
                                        />
                                    </ButtonGroup>
                                </div>
                                <hr />
                                <div>
                                    <strong>Legend</strong>
                                    <Form.Check
                                        type="checkbox"
                                        label="Show legend"
                                        id="showlegendcheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                showLegend: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.showLegend}
                                    />
                                    <Form.Check
                                        type="checkbox"
                                        label="Include subset counts (e.g. 64k)"
                                        id="subsetcountscheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                showSubsetCounts: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.showSubsetCounts}
                                    />
                                    <div style={{ marginTop: '5px', marginBottom: '10px' }}>
                                        Legend font size:
                                        <FontSizeGroup
                                            screenshotState={this.props.screenshotState}
                                            setScreenshotState={this.props.setScreenshotState}
                                            fontProp="legendLabelFontSize"
                                            fontSize1={12}
                                            fontSize2={20}
                                            fontSize3={30}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', }}>
                                        Location:
                                        <ButtonGroup style={{ marginLeft: '10px' }}>
                                            <GeneralToggleButton
                                                label="Left"
                                                currentValue={this.props.screenshotState.legendLocation}
                                                buttonValue="left"
                                                callback={(val) => {
                                                    this.props.setScreenshotState({
                                                        legendLocation: val
                                                    })
                                                }}
                                                height="26px"
                                                useApprox={false}
                                                buttonVariant="primary"
                                            />
                                            <GeneralToggleButton
                                                label="Right"
                                                currentValue={this.props.screenshotState.legendLocation}
                                                buttonValue="right"
                                                callback={(val) => {
                                                    this.props.setScreenshotState({
                                                        legendLocation: val
                                                    })
                                                }}
                                                height="26px"
                                                useApprox={false}
                                                buttonVariant="primary"
                                            />
                                        </ButtonGroup>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                                        Extra space on top:
                                        <Form.Control type="number"
                                            style={{
                                                width: '4.5em',
                                                display: 'inline-block',
                                                textAlign: 'center',
                                                marginLeft: '0.5em',
                                                marginRight: '5px',
                                            }}
                                            ref={this.legendMarginTopBox}
                                            defaultValue={this.props.screenshotState.legendMarginTop}
                                            onBlur={(e) => {
                                                this.props.setScreenshotState({
                                                    legendMarginTop: e.target.value,
                                                })
                                            }}
                                            onKeyUp={(e) => {
                                                if (e.key === 'Enter') {
                                                    this.props.setScreenshotState({
                                                        legendMarginTop: e.target.value,
                                                    })
                                                }
                                            }}
                                            onChange={(e) => {
                                                // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                                // change events.
                                                if (this.legendMarginTopTimeout != null) {
                                                    clearTimeout(this.legendMarginTopTimeout)
                                                }
                                                this.legendMarginTopTimeout = setTimeout(() => {
                                                    this.props.setScreenshotState({
                                                        legendMarginTop: e.target.value,
                                                    })
                                                }, 1000)
                                            }}
                                        /> px
                                    </div>
                                </div>
                                <hr />
                                <strong>Labels</strong>
                                <br />
                                Axis label font size:
                                <FontSizeGroup
                                    screenshotState={this.props.screenshotState}
                                    setScreenshotState={this.props.setScreenshotState}
                                    fontProp="axisLabelFontSize"
                                    fontSize1={20}
                                    fontSize2={28}
                                    fontSize3={35}
                                />
                                <br />
                                Axis tick font size:
                                <FontSizeGroup
                                    screenshotState={this.props.screenshotState}
                                    setScreenshotState={this.props.setScreenshotState}
                                    fontProp="axisTickFontSize"
                                    fontSize1={20}
                                    fontSize2={28}
                                    fontSize3={35}
                                />
                                <hr />
                                <strong>Grid</strong>
                                <div style={{ display: 'flex' }}>
                                    <Form.Check
                                        type="checkbox"
                                        label="Grid X"
                                        id="gridxcheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                showGridX: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.showGridX}
                                    />
                                    <Form.Check
                                        style={{ marginLeft: '30px' }}
                                        type="checkbox"
                                        label="Zero line X"
                                        id="zeroxcheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                zeroLineX: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.zeroLineX}
                                    />
                                </div>
                                <div style={{ display: 'flex' }}>
                                    <Form.Check
                                        type="checkbox"
                                        label="Grid Y"
                                        id="gridycheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                showGridY: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.showGridY}
                                    />
                                    <Form.Check
                                        style={{ marginLeft: '30px' }}
                                        type="checkbox"
                                        label="Zero line Y"
                                        id="zeroycheck"
                                        onChange={(e) => {
                                            setScreenshotState({
                                                zeroLineY: e.target.checked,
                                            })
                                        }}
                                        defaultChecked={this.props.screenshotState.zeroLineY}
                                    />
                                </div>
                            </div>
                        </div>
                    </Split>
                </div>
            </Modal >
        )
    }
}

class FontSizeGroup extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }

        this.setFontSize = this.setFontSize.bind(this)

        let nBinsTimeout = null
        this.numberBox = React.createRef()
    }

    setFontSize(fontSize) {
        let prop = {}
        prop[this.props.fontProp] = fontSize
        this.props.setScreenshotState(prop)
        this.numberBox.current.value = fontSize
    }

    render() {
        return (
            <div>
                <ButtonGroup>
                    <FontSizeToggleButton
                        variant="outline-primary"
                        size={this.props.screenshotState[this.props.fontProp]}
                        mySize={this.props.fontSize1}
                        outputSize={this.props.fontSize1}
                        setSize={this.setFontSize}
                    />
                    <FontSizeToggleButton
                        variant="outline-primary"
                        size={this.props.screenshotState[this.props.fontProp]}
                        mySize={this.props.fontSize2}
                        outputSize={this.props.fontSize2}
                        setSize={this.setFontSize}
                    />
                    <FontSizeToggleButton
                        variant="outline-primary"
                        size={this.props.screenshotState[this.props.fontProp]}
                        mySize={this.props.fontSize3}
                        outputSize={this.props.fontSize3}
                        setSize={this.setFontSize}
                    />
                </ButtonGroup>
                <ButtonGroup>
                    <Form.Control type="number"
                        style={{
                            width: '4.5em',
                            display: 'inline-block',
                            textAlign: 'center',
                            marginLeft: '0.5em',
                        }}
                        ref={this.numberBox}
                        defaultValue={this.props.screenshotState[this.props.fontProp]}
                        onBlur={(e) => {
                            this.setFontSize(e.target.value)
                        }}
                        onKeyUp={(e) => {
                            if (e.key === 'Enter') {
                                this.setFontSize(e.target.value)
                            }
                        }}
                        onChange={(e) => {
                            // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                            // change events.
                            if (this.nBinsTimeout != null) {
                                clearTimeout(this.nBinsTimeout)
                            }
                            this.nBinsTimeout = setTimeout(() => {
                                this.setFontSize(e.target.value)
                            }, 1000)
                        }}

                    />
                </ButtonGroup>
            </div>
        )
    }
}

class FontSizeToggleButton extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }
    }

    render() {
        let sizePt = this.props.mySize + 'pt'
        // let borderPx = this.props.size == this.props.outputSize ? '1px' : '1px'
        return (
            <ToggleButton
                variant={this.props.size == this.props.outputSize ? 'primary' : 'outline-primary'}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={(e) => this.props.setSize(this.props.outputSize)}
            >
                <span style={{ fontSize: sizePt, height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A</span>
            </ToggleButton>
        )
    }
}

class GeneralToggleButton extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }
    }

    render() {
        let isSelected = this.props.currentValue == this.props.buttonValue
        if (this.props.useApprox) {
            isSelected = Math.abs(this.props.currentValue - this.props.buttonValue) < 0.01;
        }
        return (
            <ToggleButton
                variant={isSelected ? `${this.props.buttonVariant}` : `outline-${this.props.buttonVariant}`}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={(e) => this.props.callback(this.props.buttonValue)}
            >
                <span style={{ height: this.props.height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{this.props.label}</span>
            </ToggleButton>
        )
    }
}

export { ScreenshotDialog };
