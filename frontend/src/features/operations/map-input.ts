/** Keep wheel gestures inside the complete map, including its HTML overlays. */
export function installMapWheelBoundary(boundary:HTMLElement,canvas:HTMLCanvasElement) {
  const wheel=(event:WheelEvent)=>{
    event.preventDefault();
    if(event.target===canvas)return; // OrbitControls owns zooming this event.
    event.stopPropagation();
    // Labels, toolbar buttons and attribution sit above the WebGL canvas. Relay
    // their wheel gesture once, so a label never becomes an accidental scroll hole.
    const Wheel=canvas.ownerDocument.defaultView!.WheelEvent;
    canvas.dispatchEvent(new Wheel('wheel',{
      bubbles:true,cancelable:true,deltaX:event.deltaX,deltaY:event.deltaY,
      deltaZ:event.deltaZ,deltaMode:event.deltaMode,clientX:event.clientX,clientY:event.clientY,
      ctrlKey:event.ctrlKey,shiftKey:event.shiftKey,altKey:event.altKey,metaKey:event.metaKey,
    }));
  };
  const contain=(event:WheelEvent)=>event.stopPropagation();
  boundary.addEventListener('wheel',wheel,{capture:true,passive:false});
  boundary.addEventListener('wheel',contain,{passive:true});
  return ()=>{boundary.removeEventListener('wheel',wheel,true);boundary.removeEventListener('wheel',contain);};
}
