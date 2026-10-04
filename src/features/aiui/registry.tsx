// Registry katalogu flowassist/v1: nazwa komponentu A2UI → komponent React.
// Walidacja propsów żyje w catalog.ts (czysta, testowalna); tu tylko mapowanie na widoki.

import type { ComponentType } from 'react';
import type { CatalogName } from './contract';
import type { ViewProps } from './components/types';
import ActionBar from './components/ActionBar';
import Approval from './components/Approval';
import Chart from './components/Chart';
import DataTable from './components/DataTable';
import InsightCards from './components/InsightCards';
import MapView from './components/MapView';
import Presentation from './components/Presentation';
import Stack from './components/Stack';
import TaskList from './components/TaskList';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REGISTRY: Record<CatalogName, ComponentType<ViewProps<any>>> = {
    TaskList,
    InsightCards,
    Chart,
    DataTable,
    MapView,
    Presentation,
    Approval,
    Stack,
    ActionBar,
};
