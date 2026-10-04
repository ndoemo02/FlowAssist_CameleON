// Registry katalogu flowassist/v2.
// - TREE_VIEWS: komponenty renderowane drzewem A2UI w slotach HUD i tasków (TaskList, Approval).
// - REPRESENTATION_VIEWS: reprezentacja elementu stołu roboczego → widok (ta sama treść, inna forma).
// Walidacja propsów/treści żyje w catalog.ts (czysta, testowalna); tu tylko mapowanie na widoki.

import type { ComponentType } from 'react';
import type { CatalogName } from './contract';
import type { SupportedRepresentation } from './catalog';
import type { ViewProps } from './components/types';
import Approval from './components/Approval';
import Chart from './components/Chart';
import DataTable from './components/DataTable';
import InsightCards from './components/InsightCards';
import MapView from './components/MapView';
import Presentation from './components/Presentation';
import TaskList from './components/TaskList';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyView = ComponentType<ViewProps<any>>;

/** Workspace/WorkspaceItem rysuje WorkspaceLayer/ScreenLayer — w drzewie slotów są niedozwolone. */
export const TREE_VIEWS: Partial<Record<CatalogName, AnyView>> = {
    TaskList,
    Approval,
};

export const REPRESENTATION_VIEWS: Record<SupportedRepresentation, AnyView> = {
    chart2d: Chart,
    cards2d: InsightCards,
    table2d: DataTable,
    map2d: MapView,
    slides2d: Presentation,
};
