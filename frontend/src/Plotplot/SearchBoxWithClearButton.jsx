import React from 'react';
import { Form, ButtonGroup, Button } from 'react-bootstrap';

class SearchBoxWithClearButton extends React.Component {
    constructor(props) {
        super(props);

        this.onClearClicked = this.onClearClicked.bind(this)
    }

    onClearClicked(e) {
        this.props.searchBoxRef.current.value = ''
        this.props.searchBoxRef.current.focus()
        this.props.onChange(this.props.searchBoxRef.current.value)
    }

    render() {
        return (
            <ButtonGroup style={{...this.props.style }} >
                <Form.Control
                    ref={this.props.searchBoxRef}
                    type="text"
                    placeholder={this.props.placeholder}
                    onChange={(e) => { this.props.onChange(e.target.value) }}
                    autoComplete="off"  // Disables autofill
                    autoCorrect="off"   // Disables autocorrect on iOS
                    spellCheck="false"  // Disables spell checking
                    autoCapitalize="off" // Disables auto capitalization on iOS
                />
                <div style={{ position: 'relative', width: '0px', height: '0px' }}>
                    <Button onClick={this.onClearClicked} style={{ position: 'absolute', width: '36px', left: '-36px', height: '38px', top: '0px', border: '0px', borderTopLeftRadius: '0px', borderBottomLeftRadius: '0px', outline: 'none', boxShadow: 'none' }} variant="outline-secondary">
                        <i className="fas fa-times"></i>
                    </Button>
                </div>
            </ButtonGroup>
        )
    }
}

export { SearchBoxWithClearButton };
