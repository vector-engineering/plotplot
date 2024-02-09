import React from 'react';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { nFormatter } from '../utility';

class FormattedNumberWithOverlay extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        let formatted = this.props.value
        let raw = this.props.value
        let showOverlay = false

        if (this.props.value != null && Number.isInteger(this.props.value)) {
            formatted = nFormatter(this.props.value)
            raw = this.props.value.toLocaleString()

            if (this.props.value > 999) {
                showOverlay = true
            }
        } else if ((this.props.value === undefined || this.props.value === null) && this.props.nullText) {
            raw = this.props.nullText
        }

        let out = null

        if (showOverlay) {
            out = (<><OverlayTrigger key={this.props.key} placement={this.props.placement}
                overlay={
                    <Tooltip id="tooltip-edit">
                        {raw}{this.props.postText}
                    </Tooltip>
                }
            >
                <span style={this.props.style}>{formatted}{this.props.postText}</span>
            </OverlayTrigger></>)
        } else {
            out = <><span style={this.props.style}>{raw}{this.props.postText}</span></>
        }

        return out
    }
}

export { FormattedNumberWithOverlay };
