import React from 'react';
import { Button, OverlayTrigger, Tooltip, Dropdown } from 'react-bootstrap';
import { shouldShowColorbar, nanPlotsShown } from './PlotGroupUtils';
// import Slider, { SliderTooltip } from 'rc-slider';
// import 'rc-slider/assets/index.css';
import { Range, Direction, getTrackBackground } from 'react-range';
import numeral from 'numeral';


function formatLabel(value) {
    if (value === null) {
        return ''
    }
    if (value == 0) {
        return 0
    }
    const absValue = Math.abs(value);

    // If number is above abs(100), no decimals
    if (absValue > 100) {
        return numeral(value).format('0,0');
    }

    if (absValue > 0.1) {
        return numeral(value).format('0,0.00');
    }

    if (absValue > 0.01) {
        return numeral(value).format('0,0.000');
    }

    // If it's a small decimal, use decimal points
    if (absValue > 0.001) {
        return numeral(value).format('0,0.0000');
    }

    // For really small numbers, use scientific notation
    return value.toExponential(4);
}

const TwoThumbsDraggableTrackDownDirection = ({
    height, rtl, min, max, step, values, onChange, onFinalChange, disabled
}) => {
    if (!Array.isArray(values) || values.length != 2 || values[0] === undefined || values[1] === undefined) {
        return <></>
    }
    return (
        <Range
            direction={Direction.Up}
            values={values}
            step={step}
            min={min}
            max={max}
            rtl={rtl}
            disabled={disabled}
            onChange={onChange}
            onFinalChange={onFinalChange}
            renderTrack={({ props, children }) => (
                <div
                    onMouseDown={props.onMouseDown}
                    onTouchStart={props.onTouchStart}
                    style={{
                        ...props.style,
                        flexGrow: 1,
                        width: '36px',
                        display: 'flex',
                        height: height,
                    }}
                >
                    <div
                        ref={props.ref}
                        style={{
                            width: '5px',
                            height: '100%',
                            borderRadius: '4px',
                            background: getTrackBackground({
                                values,
                                colors: ['#ccc', '#548BF4', '#ccc'],
                                min: min,
                                max: max,
                                direction: Direction.Up,
                                rtl,
                            }),
                            alignSelf: 'center'
                        }}
                    >
                        {children}
                    </div>
                </div>
            )}
            renderThumb={({ index, props, isDragged }) => (
                <div
                    {...props}
                    style={{
                        ...props.style,
                        height: '24px',
                        width: '24px',
                        borderRadius: '24px',
                        backgroundColor: '#FFF',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        boxShadow: '0px 2px 6px #AAA'
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            left: '-28px',
                            color: '#fff',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            fontFamily: 'Arial,Helvetica Neue,Helvetica,sans-serif',
                            padding: '4px',
                            borderRadius: '4px',
                            backgroundColor: '#0d6efd',
                            display: isDragged ? '' : 'none'
                        }}
                    >
                        {formatLabel(values[index])}
                    </div>
                    {/* <div
                style={{
                  height: '5px',
                  width: '5px',
                  backgroundColor: isDragged ? '#0d6efd' : '#CCC',
                }}
              /> */}
                </div>
            )}
        />
    );
};


function buttonVariant(colorscale, buttonLabel) {
    if (colorscale == buttonLabel) {
        return 'primary'
    }
    return 'outline-secondary'
}

function ColorscaleButton(setColorScale, current_colorscale, this_label) {
    return (
        <Button variant={buttonVariant(current_colorscale, this_label)} onClick={() => setColorScale(this_label)} >
            <img src={this_label + '.jpg'} alt={this_label} />
            {this_label}
        </Button>
    )
}

class ColorBarLegend extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }
    }

    render() {
        // console.log(this.props.graphJson)
        // Check for color scales
        let colorscales = []
        if (this.props.graphJson && 'data' in this.props.graphJson) {
            for (let i in this.props.graphJson.data) {
                if ('colorscale' in this.props.graphJson.data[i]) {
                    // console.log(this.props.graphJson.data[i].colorscale)
                }
            }
        }
        let output = <></>

        let colorbarMargin = 120
        if (nanPlotsShown(this.props.graphJson.layout)) {
            colorbarMargin = 60
        }

        let axisTitle = 'Density'
        let showLegend = false
        let isVar = false

        if (this.props.zAxis && this.props.zAxis != '') {
            axisTitle = this.props.zAxis
            showLegend = true
            isVar = true
        }

        if (!showLegend && this.props.graphJson) {
            showLegend = shouldShowColorbar(this.props.graphJson)
        }
        if (showLegend) {

            let removeButton = <></>
            let colorMenu = <></>
            if (isVar) {
                removeButton = (
                    <OverlayTrigger key={'colorbar-remove'} placement={'left'}
                        overlay={
                            <Tooltip>
                                Remove color variable
                            </Tooltip>
                        }
                    >
                        <Button variant="outline-secondary" onClick={this.props.clearZAxis} style={{ border: '0px', marginTop: '3px' }}><i className="fas fa-times-circle"></i></Button>
                    </OverlayTrigger>
                )

                colorMenu = (
                    <Dropdown autoClose="outside">
                        <Dropdown.Toggle variant="">
                            <span>
                                <i className="fas fa-tint"></i>
                            </span>
                        </Dropdown.Toggle>

                        <Dropdown.Menu renderOnMount={true}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginLeft: '10px', marginRight: '10px', marginTop: '10px' }}>
                                <Button variant={buttonVariant(this.props.colorscale, null)} onClick={() => this.props.setColorScale(null)}>
                                    <img src="subsets.jpg" alt="Subsets" style={{ border: '1px solid black' }} />
                                    Subsets
                                </Button>

                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Plasma')}
                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Picnic')}

                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Viridis')}
                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Rainbow')}
                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'RdBu')}

                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Blues')}
                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Greens')}
                                {ColorscaleButton(this.props.setColorScale, this.props.colorscale, 'Reds')}
                            </div>
                            <Dropdown.ItemText style={{ textAlign: 'center' }}>
                                <Button variant="outline-secondary" onClick={this.props.flipColorScale} >Flip colorscale</Button>
                            </Dropdown.ItemText>
                        </Dropdown.Menu>
                    </Dropdown>
                )
            }

            let values = this.props.colorSliderValues
            const sliderHeight = parseInt(this.props.plotDims[1]) - colorbarMargin + 'px'
            let slider = <></>
            if (this.props.cmax == this.props.cmin) {
                // Degenerate case, likely the variable is all the same (all 1s) or something
                slider = (
                    <OverlayTrigger key={'disabled-slider'} placement={'left'}
                        overlay={
                            <Tooltip id="tooltip-edit" style={{}}>
                                Can't select:<br />All values are: <span style={{ fontFamily: 'monospace' }}>{this.props.cmin}</span>
                            </Tooltip>
                        }><div>
                            <TwoThumbsDraggableTrackDownDirection
                                height={sliderHeight}
                                min={this.props.cmin - 0.1}
                                max={this.props.cmax + 0.1}
                                disabled={true}
                                step={0.01}
                                values={[this.props.cmin, this.props.cmax]}
                            /></div>
                    </OverlayTrigger>)
            } else if (values && this.props.cmax !== null && this.props.cmin !== null && this.props.cmax > this.props.cmin) {
                slider = (<TwoThumbsDraggableTrackDownDirection
                    height={sliderHeight}
                    min={this.props.cmin}
                    max={this.props.cmax}
                    step={Math.max(1e-10, (this.props.cmax - this.props.cmin) / 1000)}
                    onChange={this.props.onColorSliderChange}
                    onFinalChange={this.props.onColorSliderFinalChange}
                    values={values}
                />)
            }

            let sliderVis = this.props.isSelectingData && isVar ? 'visible' : 'hidden'

            output = <>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <div style={{ height: parseInt(this.props.plotDims[1]) - colorbarMargin + 'px', marginTop: '60px', marginBottom: '60px', visibility: sliderVis, width: '10px' }}>
                        {slider}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingRight: '5px' }}>
                        <div style={{ fontSize: '135%', writingMode: 'vertical-lr', overflowWrap: 'anywhere', maxHeight: '70vh', textAlign: 'center', marginBottom: '5px' }}>
                            {axisTitle}
                        </div>
                        <OverlayTrigger key={'colorbar-swap'} placement={'left'}
                            overlay={
                                <Tooltip>
                                    Flip color scale
                                </Tooltip>
                            }
                        >
                            <Button variant="outline-secondary" onClick={this.props.flipColorScale} style={{ border: '0px', marginTop: '3px', transform: "rotate(90deg)" }}><i className="fas fa-exchange-alt"></i></Button>
                        </OverlayTrigger>

                        {colorMenu}

                        {removeButton}
                    </div>
                </div>
            </>
        }
        return (
            output
        )
    }
}

export { ColorBarLegend };
