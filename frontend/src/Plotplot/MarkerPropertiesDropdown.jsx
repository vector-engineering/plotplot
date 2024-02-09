import React from 'react';
import ToggleButton from 'react-bootstrap/ToggleButton';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Form from 'react-bootstrap/Form';
import Dropdown from 'react-bootstrap/Dropdown';
import { ColorPicker } from './ColorPicker';
import {ColorInput} from './ColorWheel';


import { dotStyle, getUiSizeFromMarkerSize } from '../utility';


class MarkerPropertiesDropdown extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            size: this.props.size,
        }

        this.setSize = this.setSize.bind(this)

        let nBinsTimeout = null
        this.numberBox = React.createRef()
    }

    setSize(size) {
        this.setState({
            size: size
        })
        this.props.setSize(size)
        this.numberBox.current.value = size
    }

    render() {
        return (
            <Dropdown.Menu renderOnMount={true} style={{ textAlign: 'center' }} className="dropdown-menu-center" >
                <Dropdown.ItemText>
                    <ButtonGroup>

                        <SizeToggleButton
                            size={this.state.size}
                            mySize={1}
                            outputSize={1}
                            color={this.props.color}
                            setSize={this.setSize}
                        />
                        <SizeToggleButton
                            size={this.state.size}
                            mySize={3}
                            outputSize={3}
                            color={this.props.color}
                            setSize={this.setSize}
                        />
                        {/* <SizeToggleButton
                            size={this.state.size}
                            mySize={5}
                            outputSize={5}
                            color={this.props.color}
                            setSize={this.setSize}
                        /> */}

                        <SizeToggleButton
                            size={this.state.size}
                            mySize={5}
                            outputSize={10}
                            color={this.props.color}
                            setSize={this.setSize}
                        />

                        <SizeToggleButton
                            size={this.state.size}
                            mySize={12}
                            outputSize={25}
                            color={this.props.color}
                            setSize={this.setSize}
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
                            defaultValue={this.state.size}
                            onBlur={(e) => {
                                this.setSize(e.target.value)
                            }}
                            onKeyUp={(e) => {
                                if (e.key === 'Enter') {
                                    this.setSize(e.target.value)
                                }
                            }}
                            onChange={(e) => {
                                // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                                // change events.
                                if (this.nBinsTimeout != null) {
                                    clearTimeout(this.nBinsTimeout)
                                }
                                this.nBinsTimeout = setTimeout(() => {
                                    this.setSize(e.target.value)
                                }, 1000)
                            }}

                        />
                    </ButtonGroup>
                </Dropdown.ItemText>
                {/* <hr style={{marginLeft: '3em', marginRight: '3em', marginTop: '0.2em', marginBottom: '0em'}} /> */}
                <Dropdown.ItemText>
                    <ColorPicker triangle={'hide'} activeColor={this.props.color} onChange={this.props.onColorChange} />
                </Dropdown.ItemText>
                <Dropdown.ItemText>
                        <ColorInput
                            color={this.props.color}
                            onColorChange={(e) => {console.log(e); this.props.onColorChange({'hex': e.hex8String})}} 
                            style={{margin: 'auto'}} />
                </Dropdown.ItemText>
            </Dropdown.Menu >)
    }
}

class SizeToggleButton extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }
    }

    render() {
        let sizePx = this.props.mySize * 2 + 2 + 'px'
        let borderPx = this.props.size == this.props.outputSize ? '1px' : '1px'
        return (
            <ToggleButton
                variant={this.props.size == this.props.outputSize ? 'primary' : 'outline-primary'}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onClick={(e) => this.props.setSize(this.props.outputSize)}
            >
                <span style={{ ...dotStyle(this.props.color, sizePx, borderPx) }}></span>
            </ToggleButton>
        )
    }
}

export { MarkerPropertiesDropdown };
