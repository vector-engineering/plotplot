import useState from 'react-usestateref';
import React, { useRef } from 'react';
import { useDrop } from 'react-dnd';
import Collapse from 'react-bootstrap/Collapse'
import Button from 'react-bootstrap/Button'
import { ItemTypes } from './ItemTypes';
import { Buffer } from 'buffer'

import ContentEditable from "react-contenteditable";

// There is some real complexity in this unfortunately.
// We use a content editable to manage the box.
//
// We make SVGs on the fly when the user drops a variable in
//
// There is a large amount of code to deal with saving and restoring the cursor position on loss and gain of focus.

function makeMathSvg(name) {
    const len = name.length * 14
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + len + '" height="28"><text text-anchor="middle" font-family="monospace" x="' + len / 2 + '" y="19" font-size="150%">' + name + '</text></svg>'
    const encodedString = Buffer.from(svg).toString('base64');

    let img = '<img class="math-svg math-item" data-mathvar="' + name + '" width="' + len + '" src="data:image/svg+xml;base64,' + encodedString + '"/>'

    return img
}

function parseMath(html) {
    // Parses the HTML expression and extracts <img> tags that are our math variables.
    //
    // Output looks like: 1 + <mathvar>varname</mathvar> + 2
    const parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html')

    for (let img of doc.querySelectorAll('img')) {
        const varname = img.getAttribute('data-mathvar')
        const newItem = document.createElement('mathvar');
        newItem.innerHTML = varname
        img.parentNode.replaceChild(newItem, img)
    }
    return doc.body.innerHTML
}

function sendMath(math, dataId, setColumns, setError, setLastWasError) {
    let mathexpr = parseMath(math)

    const requestOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            expr: mathexpr,
        })
    }

    fetch("api/" + dataId + "/math", requestOptions)
        .then(res => res.json())
        .then(
            (result) => {
                if ('error' in result) {
                    setError(result['error']);
                    setLastWasError(true)
                } else {
                    setError('')
                    setLastWasError(false)
                    setColumns(result['cols'], result['col_labels'], result['new_var'])
                }
            }
        )
}

// From: https://stackoverflow.com/a/59146133/730138
function setCaret(el, nodeNum) {
    let range = document.createRange(),
        sel = window.getSelection(),
        lastKnownIndex = -1;
    for (let i = 0; i < el.childNodes.length; i++) {
        lastKnownIndex = i;
    }
    if (lastKnownIndex === -1) {
        throw new Error('Could not find valid text content');
    }
    let row = null
    let col = null

    if (nodeNum !== null) {
        let imageExtra = 1 // this is a hack to fix cursor positioning when an image proceeds the drop
        if (el.childNodes[nodeNum].tagName === "IMG") {
            imageExtra = 0
        }
        row = el.childNodes[nodeNum+1+imageExtra] // +1 because we want to be on the node after the image
        col = 0
    }

    if (!row) {
        row = el.childNodes[lastKnownIndex];
        col = row.textContent.length;
    }

    range.setStart(row, col);
    range.setEnd(row, col);
    //range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.focus();
}

// global variable that is not state
// Used to track where the cursor was last, so that we can drop new variables in at that position.
let oldTextAndPos = null
    
export const MathBox = (props) => {
    // const [isExpanded, setExpanded] = useState(false);
    const [text, setText, textRef] = useState('');
    const [error, setError, errorRef] = useState('');
    const [lastWasError, setLastWasError] = useState(false);
    const mathBox = useRef(null);
    
    const handleChange = evt => {
        setText(evt.target.value);
    };

    const handleOnSelect = (e) => {
        let textPos = getTextAndCusorPosition()
        oldTextAndPos = textPos
    }

    const getTextAndCusorPosition = () => {
        if (window.getSelection) {
            let sel = window.getSelection();
            if (!sel.anchorNode) {
                return ['', 0]
            }

            let before = []
            let after = []
            if (sel.anchorNode.tagName == "DIV") {
                // After an image.
                let r = sel.getRangeAt(0)
                before = Array.from(sel.anchorNode.childNodes).slice(0, r.startOffset)
                after = Array.from(sel.anchorNode.childNodes).slice(r.endOffset)
            } else {
                before = getPrevChildren(sel.anchorNode.previousSibling, [])
                after = getNextChildren(sel.anchorNode.nextSibling, [])
            }
            
            let out = ''

            for (let node of before) {
                if (node.tagName == 'IMG') {
                    out += node.outerHTML
                } else {
                    out += node.nodeValue
                }
            }
            
            // Insert the tag at the selection point.
            let nodeText = sel.anchorNode.nodeValue
            const range = sel.getRangeAt(0)

            if (!nodeText) {
                nodeText = ''
            }
            const beforeCursor = nodeText.substring(0, range.startOffset)
            const afterCursor = nodeText.substring(range.endOffset)

            out += beforeCursor

            let cursorPos = out.length

            out += afterCursor
        
            for (let node of after) {
                if (node.tagName == 'IMG') {
                    out += node.outerHTML
                } else {
                    out += node.nodeValue
                }
            }
            return [out, cursorPos, before.length]
        }
        return oldTextAndPos
    };

    function getPrevChildren(node, all_nodes) {
        if (!node) {
            return all_nodes
        }
        if (!node.previousSibling) {
            return [node, ...all_nodes]
        }
        return getPrevChildren(node.previousSibling, [node, ...all_nodes])
    }

    function getNextChildren(node, all_nodes) {
        if (!node) {
            return all_nodes
        }
        if(!node.nextSibling) {
            return [...all_nodes, node]
        }
        return getNextChildren(node.nextSibling, [...all_nodes, node])
    }

    function insertTextAtCaret(textToInsert) {
        let textAndPos = null
        if (window.getSelection) {
            let sel = window.getSelection();

            // Check to see if this is a valid cursor selection on the mathbox.
            if (sel.anchorNode && sel.anchorNode.parentNode == mathBox.current) {
                textAndPos = getTextAndCusorPosition()
            } else {
                textAndPos = oldTextAndPos
            }
        } else {
            textAndPos = oldTextAndPos
        }

        if (!textAndPos) {
            setText(textToInsert)
            return null
        }
        let out = textAndPos[0].substring(0, textAndPos[1]) + textToInsert + textAndPos[0].substring(textAndPos[1])

        setText(out)

        return textAndPos[2]
    }

    const handleKeyPress = (event) => {
        setLastWasError(false)
        var keyCode = event.which || event.keyCode;
        if (keyCode === 13) {
            event.preventDefault()
            sendMath(textRef.current, props.dataId, props.setColumns, setError, setLastWasError)
        }
    }

    const [{ canDrop, isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.BOX,
        drop: () => ({
            name: props.name, onDrop: (item) => {
                // On drop, add the element to the textbox.
                const sel = window.getSelection();

                const nodeNum = insertTextAtCaret(makeMathSvg(item.name))
                //setText(textRef.current + makeMathSvg(item.name))

                // Move focus to the math box.
                setTimeout(() => {
                    setCaret(mathBox.current, nodeNum)
                }, 100)
            }
        }),
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));
    const isActive = canDrop && isOver;
    let borderColor = '#FFFFFF00';
    let color = '#000000FF'
    let editableClasses = ''
    let textboxOutlineColor = 'black'
    if (isActive) {
        // Drop item is hovering over us
        color = '#000000FF'
        borderColor = 'black';
        editableClasses = 'dropready'
        textboxOutlineColor = 'white'
    }
    else if (canDrop) {
        // Drop item has been picked up.
        color = '#AAAAAAFF'
        borderColor = 'gray';
        textboxOutlineColor = 'white'
    }

    let hrDisplay = 'none'
    if (error != '') {
        hrDisplay = ''
    }

    const mathColor = lastWasError ? 'red' : 'black'

    let arrowClass = props.expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-up'

    return (<>
        <div style={{
            position: 'fixed',
            bottom: '0',
            width: 'calc(100% - var(--react-split-primary))',
            paddingRight: '10px',
            zIndex: 1, // be above other drop areas
        }}>
            <Collapse in={props.expanded}>
                <div style={{ borderTop: 'solid', borderWidth: '2px', borderColor: '#0d6efd', backgroundColor: 'white'}}>
                    <table><thead><tr><td width="100%">
                        <div ref={drop} role={'DropArea'} style={{
                            fontSize: '150%',
                            fontFamily: 'monospace',
                            marginTop: '5px',
                            marginLeft: '5px',
                            marginRight: '5px',
                            color: color,
                            borderWidth: '5px',
                            borderColor: borderColor,
                            borderStyle: 'dashed',
                        }}>
                            <div onKeyPress={handleKeyPress} style={{
                                borderWidth: '1px',
                                borderColor: textboxOutlineColor,
                                borderStyle: 'solid',
                                borderRadius: '4px',
                                color: mathColor,
                            }}>
                                <ContentEditable html={text} onSelect={handleOnSelect} onChange={handleChange} data-ph="[Drop a variable] + 2" style={{ paddingLeft: '5px' }} className={editableClasses} innerRef={mathBox} />
                            </div>

                        </div></td><td><Button onClick={() => sendMath(textRef.current, props.dataId, props.setColumns, setError, setLastWasError)}>=</Button></td><td style={{ paddingLeft: '10px' }}><Button variant="outline-secondary" onClick={props.collapse}><i className="fas fa-chevron-down"></i></Button></td></tr></thead></table>
                    <hr style={{ display: hrDisplay }} />
                    <div className="math-error">
                        <p style={{ display: hrDisplay, color: 'red' }}>
                            Math error:
                        </p>
                        {error}
                    </div>
                    <div style={{ height: '5px' }}></div>
                </div>
            </Collapse>
        </div>
        <div style={{ visibility: 'hidden'}}>
            {/* Some elements that are about the same height as the math box, so they provide space when the box is expanded
            at the bottom of the page. */}
            <Button variant="outline-secondary"><i className="fas fa-chevron-down"></i></Button>
            <br />
            <Button variant="outline-secondary"><i className="fas fa-chevron-down"></i></Button>
        </div>
        </>
    )
}
