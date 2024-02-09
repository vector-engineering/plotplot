import { Form } from 'react-bootstrap';
import { useDrop } from 'react-dnd';
import { ItemTypes } from '../ItemTypes';

export const AxisLogSwitch = (props) => {
    const [{ canDrop, isOver }, drop] = useDrop(() => ({
        accept: ItemTypes.BOX,
        drop: () => ({ name: props.name, onDrop: props.onDrop }),
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            canDrop: monitor.canDrop(),
        }),
    }));
    let disp = ''
    if (canDrop) {
        disp = 'none'
    }
    return (<Form.Check
        type="switch"
        label={<span>Log</span>}
        style={{ 'display': disp }}
        onChange={props.onChange}
        defaultChecked={props.default}
    />);
};
