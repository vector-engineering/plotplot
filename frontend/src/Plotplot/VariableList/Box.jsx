import { useDrag } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';
import Form from 'react-bootstrap/Form';

const style = {
    border: '1px dashed gray',
    backgroundColor: 'white',
    padding: '0.5rem 0.5rem',
    marginRight: '1.5rem',
    marginBottom: '0.5rem',
    cursor: 'move',
    float: 'left',

};
export const Box = function Box({ name, style2, classIn, label, colname }) {
    const [{ isDragging }, drag] = useDrag(() => ({
        type: ItemTypes.BOX,
        item: { name: colname },
        end: (item, monitor) => {
            const dropResult = monitor.getDropResult();
            if (item && dropResult) {
                dropResult.onDrop(item)
            }
        },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
            handlerId: monitor.getHandlerId(),
        }),
    }));
    let labelSpan = ''
    if (label) {
        labelSpan = <span style={{fontSize: 'small', color: 'gray', marginRight: '5px'}}>{label}</span>
    }
    const opacity = isDragging ? 0.4 : 1;
    return (<div ref={drag} className={classIn} role="Box" style={{ ...style, ...style2, opacity }} data-testid={`box-${name}`}>
        {labelSpan}
        {name}
    </div>);
};
