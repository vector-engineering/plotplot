import { useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
const style = {
    height: '100%',
    width: '100%',
    marginRight: '1.5rem',
    marginBottom: '1.5rem',
    padding: '1rem',
    textAlign: 'center',
    fontSize: '2rem',
    lineHeight: 'normal',
    float: 'left',
    borderStyle: 'dashed',
};
export const DropArea = (props) => {
    const [{ canDrop, isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.BOX,
        drop: () => ({ name: props.name, onDrop: props.onDrop }),
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));
    const isActive = canDrop && isOver;
    let backgroundColor = '#FFFFFF';
    let borderWidth = '5px';
    let textDecoration = '';
    let color = '#000000FF'
    let borderColor = 'gray'
    let display = 'none';

    if (props.show) {
        if (isActive) {
            // Item is hovering over us
            backgroundColor = '#FFFFFF';
            borderWidth = '5px'
            color = '#000000FF'
            borderColor = 'black'
            display = 'block'
            //textDecoration = 'overline underline';
        }
        else if (canDrop) {
            // Drop item has been picked up.
            backgroundColor = '#FFFFFF';
            borderWidth = '5px'
            color = '#AAAAAAFF'
            borderColor = 'gray'
            display = 'block'
        }
    }
    return (
        <div style={{ ...props.divStyle, display, zIndex: 1 }}>
            <div ref={drop} role={'DropArea'} style={{ ...style, backgroundColor, borderWidth, color, borderColor }}>
                <div style={{ display: 'grid', width: '100%', height: '100%' }}>
                    <p style={{ margin: 'auto', writingMode: props.writingMode, transform: props.transform, textDecoration }} >
                        {(isActive || canDrop) ? props.text : ''}
                    </p>
                </div>
            </div>
        </div>);
};
