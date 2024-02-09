import React, { useState, useEffect, useRef, useMemo } from 'react';
import { OverlayTrigger, Button, Tooltip } from 'react-bootstrap';
import { Box } from './Box';
import { matchesSearch } from '../../utility'
import Form from 'react-bootstrap/Form';



function VariableList(props) {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        fetch("api/" + props.dataId + "/columns")
            .then(res => res.json())
            .then(
                (result) => {
                    const numeric = result['numeric']
                    const non_numeric = result['non_numeric']
                    const col_labels = result['col_labels']
                    props.setAllColumns(numeric, non_numeric, col_labels)
                    setIsLoaded(true)
                }
            )
    }, []);

    const allcols = useMemo(() => {
        console.log('Loading variable list...');

        if (!isLoaded || !props.numericColumns || !props.nonNumericColumns) {
            return []
        }

        let allcols = []
        if (props.colLabels) {
            // if col labels exists, this is probably a .h5ad file
            // only show things that aren't X.
            for (let [label, value] of Object.entries(props.colLabels)) {
                for (let c of props.colLabels[label]) {
                    allcols.push([c[0].toString(), c[1], label, label + ' ' + c[0].toString()])
                }
            }
        } else {
            for (let c of props.numericColumns) {
                allcols.push([c.toString(), true, null, c.toString()])
            }
            for (let c of props.nonNumericColumns) {
                allcols.push([c.toString(), false, null, c.toString()])
            }
            // We only sort for non-h5ad files because they tend to be much smaller.
            console.log('Sorting variable list...')
            allcols.sort((a, b) => {
                // Efficient case-insensitive sort: https://stackoverflow.com/a/49004987/730138
                return a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true })
            })
            console.log('Done sorting variable list');
        }
        
        return allcols
      }, [props.numericColumns, props.nonNumericColumns, props.colLabels, isLoaded]); // Re-sort only when these change

    if (!isLoaded) {
        return ('Loading...')
    }

    let rows = []
    let num = 0
    let cut_cols = false
    const COL_DISP_MAX = 300
    let num_dropped = 0

    for (let i = 0; i < allcols.length; i++) {
        let isNew = false
        if (
            (props.searchString.length < 1 && allcols[i][2] !== '')
            || (props.searchString.length > 0 && matchesSearch(allcols[i][3], props.searchString))
           ) {
            if (props.isNewVarList != null && props.isNewVarList.includes(allcols[i][0])) {
                isNew = true
            }

            if (allcols[i][1]) {
                rows.push(
                    <DataColumn
                        key={allcols[i][0]}
                        column_name={allcols[i][0]}
                        clearScroll={props.clearScroll}
                        scrollToMe={props.scrollAndHighlightVar == allcols[i][0]}
                        isNew={props.isNewVarList.includes(allcols[i][0])}
                        updateHoverlist={props.updateHoverlist}
                        defaultChecked={props.hoverlistNumeric ? props.hoverlistNumeric.has(allcols[i][0]) : false}
                        filterDialog={props.filterDialog}
                        label={allcols[i][2]}
                    />)
            } else {
                // non-numeric column.
                rows.push(
                    <TextColumn
                        key={allcols[i][0]}
                        column_name={allcols[i][0]}
                        filterDialog={props.filterDialog}
                        updateHoverlist={props.updateHoverlist}
                        defaultChecked={props.hoverlistNonNumeric ? props.hoverlistNonNumeric.has(allcols[i][0]) : false}
                        label={allcols[i][2]}
                    />)
            }

            num += 1;

            if (num > COL_DISP_MAX) {
                cut_cols = true
                break;
            }

        } else {
            num_dropped += 1
        }
    }
    if (cut_cols || (props.searchString.length < 1 && num_dropped > 0)) {
        rows.push(<tr key={-3}>
            <td colSpan="2">
                There are {num_dropped} more variable{num_dropped != 1 && 's'}, use search to find them.
            </td>
        </tr>)
    } else {
        if (rows.length < allcols.length) {
            rows.push(<tr key={-2}>
                <td colSpan="2">
                    Hiding {num_dropped} variable{num_dropped != 1 && 's'} not matching: <code>{props.searchString}</code>
                </td>
            </tr>)
        }
    }

    return (
        <table style={{ width: '100%' }}><tbody>{rows}</tbody></table>
    )
}



function DataColumn(props) {
    const myRef = useRef(null)

    let classname = ''

    useEffect(() => {
        if (props.scrollToMe) {
            myRef.current.scrollIntoView({ behavior: "smooth", block: 'center' })
            props.clearScroll()
        }
    });

    if (props.isNew) {
        classname = 'animate-highlight'
    }
    return (
        <tr>
            <td>
                <HoverCheckbox
                    column_name={props.column_name}
                    updateHoverlist={props.updateHoverlist}
                    isnumeric={true}
                    defaultChecked={props.defaultChecked}
                />
            </td>
            <td ref={myRef} style={{ overflowWrap: 'anywhere', width: '100%' }} className="filter-button-parent">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <FilterButton column_name={props.column_name} visibility="visible" filterDialog={props.filterDialog} />
                    <Box
                        name={props.column_name.replace(props.label + '_', '')}
                        classIn={classname}
                        label={props.label}
                        style2={{ ...props.style, marginRight: '5px' }}
                        colname={props.column_name}
                    />
                </div>
            </td>
        </tr>
    )
}

function FilterButton(props) {
    return (
        <OverlayTrigger key={props.column_name} placement={'top'}
            overlay={
                <Tooltip id="tooltip-edit">
                    Filter on <span style={{fontFamily: 'monospace'}}>{props.column_name}</span>
                </Tooltip>
            }
        >
            <Button
                className="filter-button"
                variant="outline-secondary"
                style={{
                    border: '1px solid #dddddd',
                    padding: '0.5rem 0.5rem',
                    marginRight: '5px',
                    marginBottom: '0.5rem',
                    visibility: props.visibility,
                }}
                onClick={() => props.filterDialog(props.column_name)}
            >
                <i className="fas fa-tasks"></i>
            </Button>
        </OverlayTrigger>
    )
}

function TextColumn(props) {
    const style = {
        padding: '0.5rem 0.5rem',
        marginRight: '1.5rem',
        marginBottom: '0.5rem',
        float: 'left',
    };
    let labelSpan = ''
    if (props.label) {
        labelSpan = <span className="label-column-button" style={{fontSize: 'small', marginRight: '5px'}}>{props.label}</span>
    }
    const name = props.column_name.replace(props.label + '_', '')
    return (
        <tr>
            <td>
                <HoverCheckbox
                    column_name={props.column_name}
                    updateHoverlist={props.updateHoverlist}
                    isnumeric={false}
                    defaultChecked={props.defaultChecked}
                />
            </td>
            <td style={{ overflowWrap: 'anywhere', width: '100%' }} className="filter-button-parent">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <OverlayTrigger key={props.column_name} placement={'right'}
                        overlay={
                            <Tooltip id="tooltip-edit">
                                Filter on <span style={{fontFamily: 'monospace'}}>{props.column_name}</span>
                            </Tooltip>
                        }
                    >
                        <div className="text-column-button">
                        <Button
                            variant="outline-secondary"
                            className="text-column-button" 
                            style={{ ...style, border: '1px solid #cccccc' }}
                            onClick={() => props.filterDialog(props.column_name)}>
                            <span style={{padding: '0.5rem 0.5rem',
                                    marginRight: '5px',
                                    marginBottom: '0.5rem',}}>
                                <i className="fas fa-tasks filter-button"></i>
                            </span>{labelSpan}{name}
                        </Button>
                        </div>
                    </OverlayTrigger>
                </div>
            </td>
        </tr >
    )
}


function HoverCheckbox(props) {
    return (
        <>
            <OverlayTrigger key={props.column_name} placement={'top'}
                overlay={
                    <Tooltip id="tooltip-edit">
                        Show when hovering over graph
                    </Tooltip>
                }
            >
                <Form.Check
                    type="checkbox"
                    defaultChecked={props.defaultChecked}
                    style={{ paddingRight: '10px' }}
                    onChange={(event) => props.updateHoverlist(props.column_name, event.target.checked, props.isnumeric)}

                />
            </OverlayTrigger>
        </>

    )
}
export { VariableList };
