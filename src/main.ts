import './styles.css';
import { mountApp } from './ui/app';
import { decodeHash, loadVerbosity } from './state/hash';
import { initialState, makeStore } from './state/store';

const root = document.querySelector<HTMLElement>('#app');
if (root === null) throw new Error('#app missing');

const base = initialState();
const verbosity = loadVerbosity();
const withPrefs = verbosity === undefined ? base : { ...base, verbosity };
const store = makeStore(decodeHash(location.hash, withPrefs));

mountApp(root, store);
