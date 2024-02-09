import React from 'react';
import { Form, Button } from 'react-bootstrap';
import { nFormatter } from '../../utility';
import { FormattedNumberWithOverlay } from '../FormattedNumberWithOverlay';

export default class FilterRow extends React.Component {
    constructor(props) {
        super(props);
        this.timeout = null
        this.dirty = false

        this.maybeChanged = this.maybeChanged.bind(this)
    }

    maybeChanged(e) {
        if (this.dirty) {
            this.dirty = false
            if (this.timeout != null) {
                clearTimeout(this.timeout)
            }
            this.props.filterChange(e)
        }
    }

    render() {
        let showAddButtonDisp = this.props.showAddButton ? '' : 'none'

        let showOrVis = this.props.showOr ? 'visible' : 'hidden'

        return (
            <tr>
                <td>
                    <span style={{ visibility: showOrVis }}>or </span>
                </td>
                <td>
                    <Form.Control
                        style={{ width: '50%', display: 'inline', marginRight: '10px' }}
                        type="text"
                        autoComplete="off"  // Disables autofill
                        autoCorrect="off"   // Disables autocorrect on iOS
                        spellCheck="false"  // Disables spell checking
                        autoCapitalize="off" // Disables auto capitalization on iOS
                        placeholder='filter: eg HEK*'
                        defaultValue={this.props.filter}
                        onBlur={this.maybeChanged}
                        onKeyUp={(e) => {
                            if (e.key === 'Enter') {
                                this.maybeChanged(e)
                            }
                        }}
                        onChange={(e) => {
                            // Set a timeout in 1.5 seconds to ask for a plot if there haven't been any additional
                            // change events.
                            this.props.textChanged()
                            this.dirty = true
                            if (this.timeout != null) {
                                clearTimeout(this.timeout)
                            }
                            this.timeout = setTimeout(() => {
                                this.maybeChanged(e)
                            }, 1000)
                        }}
                    />
                </td>
                <td>
                    <FormattedNumberWithOverlay
                        value={this.props.rows}
                        postText=""
                        placement="right"
                        style={{}}
                        nullText="--"
                    />
                </td>
                <td>
                    <Button variant="outline-primary" style={{ marginLeft: '10px' }}
                        onClick={this.props.removeClick}>
                        <i className="fas fa-minus"></i>
                    </Button>
                    <Button variant="outline-primary" style={{ marginLeft: '10px', display: showAddButtonDisp }}
                        onClick={this.props.addClick}>
                        <i className="fas fa-plus"></i>
                    </Button>
                </td>
            </tr>
        )
    }
}
