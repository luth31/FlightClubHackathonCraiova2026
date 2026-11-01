import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './App';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './styles.css';
import './theme.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true}}render(){return this.state.error?<div className="fatal-error"><h1>Am întâmpinat o problemă.</h1><p>Reîncarcă spațiul de lucru pentru a continua.</p><button className="button primary" onClick={()=>location.reload()}>Reîncarcă</button></div>:this.props.children}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
