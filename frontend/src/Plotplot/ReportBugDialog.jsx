import React from 'react';
import { Form, Accordion, Spinner, Modal, Button, Table } from 'react-bootstrap';
import { matchesSearch } from '../utility'


class ReportBugDialog extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
        }

        this.handleClose = this.handleClose.bind(this)
    }

    handleClose() {
        this.props.hideReportBugDialog()
    }

    render() {


        return (
            <Modal
                show={this.props.show}
                onHide={this.handleClose}
                dialogClassName="modal-90w"
                aria-labelledby="example-custom-modal-styling-title"
            >
                <Modal.Header closeButton>
                    <Modal.Title id="csv-export-title">
                        Report a Bug
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        I'm sorry you're experiencing a bug.  I know that can be super fruturating!
                    </p>

                    <div>
                        The best thing you can do is <a href="https://github.com/vector-engineering/plotplot/issues" target="_blank">submit an issue</a> and attach:
                        <ol>
                            <li>A description of the bug</li>
                            <li>A screenshot of the <strong>entire</strong> page</li>
                            <li>This <a href="#" onClick={(e) => { e.preventDefault(); this.props.downloadBugReportJson() }}>bug report file</a>.</li>
                        </ol>
                    </div>
                    <p>
                        Here's an template to copy paste from:
                    </p>
                    <Form.Control as="textarea" readOnly rows={10} ref={this.bulkTextBoxRef} style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }} value={`Hi there,
\nI'm having a problem with Plotplot.  My issue is:\n<FILL IN>\n\nHere's a screenshot of the problem\n<SCREENSHOT>\n\nI've attached the bug report file to this email:\n<YES> or <NO>\n\nThanks,\n\n<YOUR NAME>`} onClick={(e) => { e.target.select() }} />
                    <br /><p>
                        Detailed bug descriptions are really helpful to get things fixed.
                    </p>
                </Modal.Body>
            </Modal>
        )
    }
}

export { ReportBugDialog };
