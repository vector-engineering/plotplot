import React from 'react'
import PropTypes from 'prop-types'
import reactCSS from 'reactcss'
import map from 'lodash/map'
import merge from 'lodash/merge'

import { ColorWrap } from 'react-color/lib/components/common'
import GithubSwatch from 'react-color/lib/components/github/GithubSwatch'

/* Modified from GithubPicker */

export const ColorPicker = ({ width, colors, onChange, onSwatchHover, triangle, activeColor,
    styles: passedStyles = {}, className = '' }) => {
    const styles = reactCSS(merge({
        'default': {
            card: {
                width,
                background: '#fff',
                border: '0px solid rgba(0,0,0,0.2)',
                boxShadow: 'none',
                borderRadius: '4px',
                position: 'relative',
                padding: '5px',
                display: 'flex',
                flexWrap: 'wrap',
            },
            triangle: {
                position: 'absolute',
                border: '7px solid transparent',
                borderBottomColor: '#fff',
            },
            triangleShadow: {
                position: 'absolute',
                border: '8px solid transparent',
                borderBottomColor: 'rgba(0,0,0,0.15)',
            },
        },
        'hide-triangle': {
            triangle: {
                display: 'none',
            },
            triangleShadow: {
                display: 'none',
            },
        },
        'top-left-triangle': {
            triangle: {
                top: '-14px',
                left: '10px',
            },
            triangleShadow: {
                top: '-16px',
                left: '9px',
            },
        },
        'top-right-triangle': {
            triangle: {
                top: '-14px',
                right: '10px',
            },
            triangleShadow: {
                top: '-16px',
                right: '9px',
            },
        },
        'bottom-left-triangle': {
            triangle: {
                top: '35px',
                left: '10px',
                transform: 'rotate(180deg)',
            },
            triangleShadow: {
                top: '37px',
                left: '9px',
                transform: 'rotate(180deg)',
            },
        },
        'bottom-right-triangle': {
            triangle: {
                top: '35px',
                right: '10px',
                transform: 'rotate(180deg)',
            },
            triangleShadow: {
                top: '37px',
                right: '9px',
                transform: 'rotate(180deg)',
            },
        },
    }, passedStyles), {
        'hide-triangle': triangle === 'hide',
        'top-left-triangle': triangle === 'top-left',
        'top-right-triangle': triangle === 'top-right',
        'bottom-left-triangle': triangle === 'bottom-left',
        'bottom-right-triangle': triangle === 'bottom-right',
    })

    const handleChange = (hex, e) => onChange({ hex, source: 'hex' }, e)

    return (
        <div style={styles.card} className={`github-picker ${className}`}>
            <div style={styles.triangleShadow} />
            <div style={styles.triangle} />
            {map(colors, c => {
                let s = {}
                if (activeColor == c) {
                    s = {
                        position: 'relative',
                        zIndex: '2',
                        outline: '1px solid #fff',
                        boxShadow: '0 0 5px 2px rgba(0,0,0,0.25)'
                    }
                }
                return (
                    <div style={s} key={c}>
                        <GithubSwatch
                            color={c}
                            key={c}
                            onClick={handleChange}
                            onSwatchHover={onSwatchHover}
                        />
                    </div>)
            })}
        </div>
    )
}

ColorPicker.propTypes = {
    width: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    colors: PropTypes.arrayOf(PropTypes.string),
    triangle: PropTypes.oneOf(['hide', 'top-left', 'top-right', 'bottom-left', 'bottom-right']),
    styles: PropTypes.object,
}

ColorPicker.defaultProps = {
    width: 235,
    colors: [
        '#005ef5C0', '#ff7700C0', '#00a100C0', '#d60000C0', '#6100bdC0', '#8c1700C0', '#e3009fC0', '#bdbd00C0', '#00bacfC0', // bright colors
        '#4287f580', '#ff7f0e80', '#2ca02c80', '#d6272880', '#9467bd80', '#8c564b80', '#e377c280', '#bcbd2280', '#17becf80', // default colors
    ],
    triangle: 'hide',
    styles: {},
}

export default ColorWrap(ColorPicker)