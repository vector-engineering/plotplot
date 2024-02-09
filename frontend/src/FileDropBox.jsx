import { NativeTypes } from 'react-dnd-html5-backend'
import { useDrop, DropTargetMonitor } from 'react-dnd'

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
export const FileDropBox = (props) => {
    const [{ canDrop, isOver }, drop] = useDrop(
        () => ({
            accept: [NativeTypes.FILE],
            drop(item: { files: any[] }) {
                if (props.onDrop) {
                    props.onDrop(item)
                }
            },
            collect: (monitor: DropTargetMonitor) => ({
                isOver: monitor.isOver(),
                canDrop: monitor.canDrop(),
            }),
        }),
        [props],
    )
    const isActive = canDrop && isOver;
    let backgroundColor = 'white';
    let borderWidth = '5px';
    let textDecoration = '';
    let color = '#AAAAAAFF'
    let borderColor = 'gray'
    if (isActive) {
        // Item is hovering over us
        backgroundColor = '#00000011';
        borderWidth = '5px'
        color = '#000000FF'
        borderColor = 'black'
        //textDecoration = 'overline underline';
    }
    else if (canDrop) {
        // Drop item has been picked up.
        backgroundColor = '#00000011';
        borderWidth = '5px'
        color = '#AAAAAAFF'
        borderColor = 'gray'
    }
    return (<div ref={drop} role={'DropArea'} style={{ ...style, backgroundColor, borderWidth, color, borderColor }}>
        <div style={{ display: 'grid', width: '100%', height: '100%' }}>
            <p style={{ margin: 'auto', writingMode: props.writingMode, transform: props.transform, textDecoration }} >
                Drop a <span style={{fontFamily: 'monospace'}}>.csv</span> or <span style={{fontFamily: 'monospace'}}>.h5ad</span> file
            </p>
        </div>
    </div>);
};
