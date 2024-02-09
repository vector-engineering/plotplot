import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ListGroup from 'react-bootstrap/ListGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import Form from 'react-bootstrap/Form';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import { matchesSearch } from '../utility'
import { useDrag, useDrop } from 'react-dnd'
import { ItemTypes } from './ItemTypes';
import update from 'immutability-helper'

import { MarkerPropertiesDropdown } from './MarkerPropertiesDropdown';
import { FormattedNumberWithOverlay } from './FormattedNumberWithOverlay';

import { nFormatter, validateName, dotStyle, getUiSizeFromMarkerSize } from '../utility';
import memoize from "fast-memoize";


export const SubsetList = ((props) => {
    const [isLoaded, setIsLoaded] = useState(false)
    const [subsetOrderLocal, setSubsetOrderLocal] = useState(props.initSubsetOrder) // local version of subset order, used during drag/move to avoid rerendering tons of plots

    useEffect(() => {
        // Initial load of subsets
        fetch("api/" + props.dataId + "/subsets")
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        props.toastError(result['error'])
                        return
                    }
                    props.setSubsets(result)
                    setIsLoaded(true)
                }
            )
    }, []);

    const moveCard = useCallback((dragIndex, hoverIndex) => {
        setSubsetOrderLocal(
            (prevCards) =>
                update(prevCards, {
                    $splice: [
                        [dragIndex, 1],
                        [hoverIndex, 0, prevCards[dragIndex]],
                    ],
                }),
        )
    }, [])

    const deleteSubset = useCallback(
        memoize((id) => () => {
        // Tell the backend to delete.
        fetch("api/" + props.dataId + "/delete_subset?subset_id=" + id)
            .then(res => res.json())
            .then(
                (result) => {
                    if ('error' in result) {
                        props.toastError(result['error'])
                        return
                    }
                    props.setSubsets(result, false)
                }
            )
        }), [props.dataId, props.toastError, props.setSubsets])

    const renameSubset = useCallback(
        memoize((id) => (new_name) => {
            props.renameSubset(id, new_name)
        }), [props.renameSubset])

    const renderCard = useCallback((card, index, allNames) => {
        const sub = props.subsets[card]
        if (!sub) {
            return <div key={-(index+1000000)}></div>
        }
        return (
            <SubsetEntry
                key={sub['id']}
                id={sub['id']}
                name={sub['name']}
                number={sub['count']}
                color={sub['color']}
                size={sub['size']}
                deleteSubset={deleteSubset(sub['id'])}
                renameSubset={renameSubset(sub['id'])}
                allNames={allNames}
                scrollToMe={sub['id'] == props.scrollIntoViewSubset}
                dataId={props.dataId}
                clearScroll={props.clearScroll}
                downloadCsvDialog={props.downloadCsvDialog}
                subsets={props.subsets}
                setSubsets={props.setSubsets}
                moveCard={moveCard}
                index={index}
                handleDrop={handleDrop}
            />
        )
    })

    const handleDrop = useCallback(() => {
        setTimeout(() => props.setSubsetOrder(subsetOrderLocal), 50)
    }, [props.setSubsetOrder, subsetOrderLocal])

    function getAllNames() {
        let allNames = []
        for (let [id, sub] of Object.entries(subsets2)) {
            allNames.push(sub['name'])
        }
        return allNames
    }

    const subsets2 = props.subsets
    const allNames = useMemo(() => getAllNames(), [props.subsets, props.lastSubsetChange])
    

    useEffect(() => {
        let subsetOrder = []

        // Update the cards (order of subsets being shown) to add/remove subsets that no longer exist.
        for (let c of subsetOrderLocal) {
            // See if this subset still exsists
            if (c in props.subsets) {
                subsetOrder.push(c)
            }
        }

        // Add any new subsets.
        for (let s in props.subsets) {
            if (!subsetOrder.includes(props.subsets[s]['id'])) {
                subsetOrder.push(props.subsets[s]['id'])
            }
        }
        setSubsetOrderLocal(subsetOrder)

    }, [props.subsets])

    function searchFilter(card) {
        return !(card in props.subsets) || props.searchString.length < 1 || matchesSearch(props.subsets[card]['name'], props.searchString)
    }

    if (!isLoaded) {
        return <>Loading...</>
    }

    let subsetCards = null
    subsetCards = subsetOrderLocal.filter(searchFilter).map((card, i) => renderCard(card, i, allNames))
    const num_filtered = allNames.length - subsetCards.length
    if (num_filtered > 0) {
        const paddingTop = subsetCards.length > 0 ? '10px' : '0px'
        subsetCards.push(<div key={-2} style={{ paddingTop: paddingTop }}>Hiding {num_filtered} subset{num_filtered != 1 && 's'} not matching: <code>{props.searchString}</code></div>)
    }
    
    return (
        <>
            {subsetCards}
        </>
    )
})



const SubsetEntry = memo(function SubsetEntry(props) {
    const [isEditing, setIsEditing] = useState(false);
    const [isValid, setIsValid] = useState(true);
    const [isBeingDeleted, setIsBeingDeleted] = useState(false);
    const [isDropdownShown, setIsDropdownShown] = useState(false)

    const myRef = useRef(null)


    const [{ handlerId }, drop] = useDrop({
        accept: ItemTypes.CARD,
        drop: props.handleDrop,
        collect(monitor) {
            return {
                handlerId: monitor.getHandlerId(),
            }
        },
        hover(item, monitor) {
            if (!myRef.current) {
                return
            }
            const dragIndex = item.index
            const hoverIndex = props.index
            // Don't replace items with themselves
            if (dragIndex === hoverIndex) {
                return
            }
            // Determine rectangle on screen
            const hoverBoundingRect = myRef.current?.getBoundingClientRect()
            // Get vertical middle
            const hoverMiddleY =
                (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

            const topAccept = hoverMiddleY - hoverBoundingRect.height*0.2
            const bottomAccept = hoverMiddleY + hoverBoundingRect.height*0.2

            // Determine mouse position
            const clientOffset = monitor.getClientOffset()
            
            // Get pixels to the top
            const hoverClientY = clientOffset.y - hoverBoundingRect.top
            // Only perform the move when the mouse has crossed half of the items height
            // When dragging downwards, only move when the cursor is below 50%
            // When dragging upwards, only move when the cursor is above 50%
            
            // Dragging downwards
            if (dragIndex < hoverIndex && hoverClientY < topAccept) {
                return
            }
            // Dragging upwards
            if (dragIndex > hoverIndex && hoverClientY > bottomAccept) {
                return
            }
            // Time to actually perform the action
            props.moveCard(dragIndex, hoverIndex)
            // Note: we're mutating the monitor item here!
            // Generally it's better to avoid mutations,
            // but it's good here for the sake of performance
            // to avoid expensive index searches.
            item.index = hoverIndex
        },
    })
    const id = props.id
    const index = props.index

    const [{ isDragging }, drag] = useDrag({
        type: ItemTypes.CARD,
        item: () => {
            return { id, index }
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
        canDrag: !isDropdownShown,
    })
    const opacity = isDragging ? 0 : 1
    drag(drop(myRef))


    useEffect(() => {
        if (props.scrollToMe) {
            myRef.current.scrollIntoView({ behavior: "smooth", block: 'center' })
            props.clearScroll()
        }
    });

    let displayNotEditing = '';
    let displayEditing = 'none';

    if (isEditing) {
        displayNotEditing = 'none';
        displayEditing = 'inline-block';
    }

    const editInput = useRef(null);

    const handleSubmit = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (validateName(props.allNames, props.name, editInput.current.value)) {
            props.renameSubset(editInput.current.value)
            setIsEditing(false);
            setIsValid(true)
        } else {
            // Not valid!
            setIsValid(false)
        }
    };

    const span_style = { marginLeft: "auto" }
    let allVis = props.name == '(all)' ? 'hidden' : ''
    let isDisabled = isBeingDeleted ? 'disabled' : ''
    let listClass = isDragging ? '' : ' grip' + ' subset'
    return (
        <ListGroup.Item draggable="false" style={{ paddingRight: '4px', cursor: 'grab' }} className={listClass} ref={myRef}>
            <div style={{ display: "flex", opacity: isDragging ? '0' : '1', paddingLeft: '6px'}}>
                <span style={{flexGrow: 1}}>
                    <Form
                        onSubmit={handleSubmit}
                    >
                        <span style={{ display: displayNotEditing, overflowWrap: 'anywhere' }}>{props.name}</span>
                        <Form.Control
                            type="text"
                            defaultValue={props.name}
                            style={{ display: displayEditing, width: '95%' }}
                            onClick={(e) => e.stopPropagation()}
                            autoComplete="off"  // Disables autofill
                            autoCorrect="off"   // Disables autocorrect on iOS
                            spellCheck="false"  // Disables spell checking
                            autoCapitalize="off" // Disables auto capitalization on iOS
                            onFocus={e => e.target.select()}
                            ref={editInput}
                            isInvalid={!isValid}
                        />
                        <Form.Control.Feedback type="invalid">
                            Name must be unique.
                        </Form.Control.Feedback>
                        <br />
                        <FormattedNumberWithOverlay
                            value={props.number}
                            postText=" rows"
                            placement="right"
                            style={{ marginLeft: '0.5em', fontSize: 'small' }}
                        />
                    </Form>
                </span>

                <span style={span_style} >
                    <Dropdown as={ButtonGroup} style={{ display: displayNotEditing }} autoClose="outside" onToggle={(nextShow, meta) => {setIsDropdownShown(nextShow)}}>
                        <Dropdown.Toggle variant="" id="dropdown-basic" >
                            <span style={{ width: '25px' }}>
                                <span style={dotStyle(props.color, '25px')}></span>
                            </span>
                        </Dropdown.Toggle>

                        <MarkerPropertiesDropdown
                            color={props.color}
                            size={props.size}
                            onColorChange={(vals) => {
                                let subs = props.subsets
                                subs[props.id]['color'] = vals['hex']
                                props.setSubsets(subs)
                            }}
                            setSize={(size) => {
                                let subs = props.subsets
                                subs[props.id]['size'] = size
                                props.setSubsets(subs)
                            }}
                        />
                    </Dropdown>
                    <span style={{ visibility: allVis }}>
                        <OverlayTrigger
                            key={'edit'}
                            placement={'top'}
                            overlay={
                                <Tooltip id="tooltip-edit">
                                    Change subset's name
                                </Tooltip>
                            }
                        >
                            <a
                                className='btn edit-button'
                                onClick={
                                    (e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setIsEditing(true);
                                        setTimeout(() => editInput.current.focus(), 100);
                                    }
                                }
                                style={{ display: displayNotEditing }}
                            >
                                <i className='fas fa-pen fa-ve-button'></i>
                            </a>
                        </OverlayTrigger>
                        <a
                            className='btn edit-button'
                            onClick={handleSubmit}
                            style={{ display: displayEditing }}
                        >
                            <i className='fas fa-check fa-ve-button'></i>
                        </a>
                    </span>

                    <OverlayTrigger
                        key={'download'}
                        placement={'top'}
                        overlay={
                            <Tooltip id="tooltip-download">
                                Download as .csv
                            </Tooltip>
                        }
                    >
                        <a
                            className='btn edit-button'
                            onClick={(e) => {
                                props.downloadCsvDialog(props.id)
                            }}
                            style={{ display: displayNotEditing }}
                        >
                            <i className='fas fa-file-download fa-ve-button'></i>
                        </a>
                    </OverlayTrigger>

                    <span style={{ visibility: allVis }}>
                        <OverlayTrigger
                            key={'delete'}
                            placement={'top'}
                            overlay={
                                <Tooltip id="tooltip-delete">
                                    Delete subset
                                </Tooltip>
                            }
                        >
                            <a className={isDisabled + ' btn edit-button'} onClick={(e) => { setIsBeingDeleted(true); props.deleteSubset() }} style={{ display: displayNotEditing }}><i className='fas fa-trash fa-ve-button'></i></a>
                        </OverlayTrigger>
                    </span>
                </span>
            </div>

        </ListGroup.Item>
    );
})
