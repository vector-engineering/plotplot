import React, { createRef, FunctionComponent, MutableRefObject, RefObject, useEffect, useRef } from 'react';
import iro from '@jaames/iro';

class ColorInput extends React.Component {
    componentDidMount() {
        const { props } = this;
        // create a new iro color picker and pass component props to it
        this.colorPicker = new iro.ColorPicker(this.el, {
            ...props, width: 235, layout: [
                {
                    component: iro.ui.Wheel,
                    options: {
                    }
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        // can also be 'saturation', 'value', 'red', 'green', 'blue', 'alpha' or 'kelvin'
                        sliderType: 'value'
                    }
                },
                {
                    component: iro.ui.Slider,
                    options: {
                        // can also be 'saturation', 'value', 'red', 'green', 'blue', 'alpha' or 'kelvin'
                        sliderType: 'alpha'
                    }
                },
            ]
        });
        // call onColorChange prop whenever the color changes
        this.colorPicker.on('input:end', (color) => {
            if (props.onColorChange) props.onColorChange(color);
        });
    }

    componentDidUpdate() {
        // isolate color from the rest of the props
        const { color, ...colorPickerState } = this.props;
        // update color
        if (color) this.colorPicker.color.set(color);
        // push rest of the component props to the colorPicker's state
        this.colorPicker.setState(colorPickerState);
    }

    render() {
        return (
            <div ref={el => this.el = el} />
        );
    }
}

export { ColorInput };
