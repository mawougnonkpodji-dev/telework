import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';

import TaskNode from './TaskNode';
import { getEdgeColorFromParent } from './graphUtils';
import { fetchProjectTasksKanban, addTaskDependency, removeTaskDependency } from '../services/backendApi.js';
import { flattenKanbanTasks } from '../utils/apiHelpers.js';

const nodeTypes = { task: TaskNode };

function getLayoutedElements(nodes, edges, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: 200, height: 100 });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: 'left',
      sourcePosition: 'right',
      position: {
        x: nodeWithPosition.x - 100,
        y: nodeWithPosition.y - 50
      }
    };
  });

  return { nodes: layoutedNodes, edges };
}

function TaskGraphExplorer({ projectId, user }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, defaultOnEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Permissions : seuls gestionnaires/admins peuvent modifier
  const canEdit = user?.userRole === 'gestionnaire' || user?.role === 'admin';

  // Build graph
  const buildGraph = useCallback((tasksData) => {
    const taskMap = new Map(tasksData.map(t => [t.id.toString(), t]));
    const graphNodes = tasksData.map(task => ({
      id: task.id.toString(),
      type: 'task',
      data: { 
        ...task, 
        canEdit,
        onClick: () => setSelectedNodeId(prev => prev === task.id ? null : task.id)
      },
      position: { x: 0, y: 0 }
    }));
    const graphEdges = [];
    for (const task of tasksData) {
      const deps = Array.isArray(task.depends_on)
        ? task.depends_on
        : task.dependency_id != null
          ? [task.dependency_id]
          : [];
      for (const prereq of deps) {
        if (prereq == null) continue;
        const parentTask = taskMap.get(String(prereq));
        graphEdges.push({
          id: `${prereq}->${task.id}`,
          source: String(prereq),
          target: task.id.toString(),
          type: 'smoothstep',
          animated: task.column_name === 'inProgress',
          style: {
            stroke: getEdgeColorFromParent(parentTask),
            strokeWidth: task.priority === 'high' ? 3 : 2,
            strokeDasharray: parentTask && parentTask.column_name !== 'done' ? '5,5' : '0',
          },
        });
      }
    }
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(graphNodes, graphEdges);
    return { nodes: layoutedNodes, edges: layoutedEdges };
  }, [canEdit, setSelectedNodeId]);

  // Load from API
  const loadGraph = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      setError(null);
      return;
    }
    try {
      setError(null);
      const payload = await fetchProjectTasksKanban(projectId);
      if (payload) {
        const flat = flattenKanbanTasks(payload);
        const { nodes: graphNodes, edges: graphEdges } = buildGraph(flat);
        setNodes(graphNodes);
        setEdges(graphEdges);
        setIsLoading(false);
      } else {
        setError('Impossible de charger les tâches du projet');
        setIsLoading(false);
      }
    } catch (err) {
      setError('Erreur réseau ou serveur inaccessible');
      setIsLoading(false);
    }
  }, [projectId, buildGraph, setNodes, setEdges]);

  // Initial load
  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Reset history when project changes
  useEffect(() => {
    setHistory([]);
    setHistoryIndex(-1);
  }, [projectId]);

  // Refresh
  const refreshGraph = useCallback(async () => {
    if (!projectId) return;
    try {
      const payload = await fetchProjectTasksKanban(projectId);
      if (payload) {
        const flat = flattenKanbanTasks(payload);
        const { nodes: graphNodes, edges: graphEdges } = buildGraph(flat);
        setNodes(graphNodes);
        setEdges(graphEdges);
      }
    } catch (err) {
      console.error('Failed to refresh graph:', err);
    }
  }, [projectId, buildGraph, setNodes, setEdges]);

  // History stack
  const pushHistory = useCallback((action) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      return [...newHistory, action];
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  // Clear dependency (edge removal) – only if canEdit
  const handleClearDependency = useCallback(async (dependentTaskId, prerequisiteId, record = true) => {
    if (!canEdit) return;
    try {
      const res = await removeTaskDependency(dependentTaskId, prerequisiteId);
      if (!res.ok) {
        refreshGraph();
        return;
      }
      if (record) {
        pushHistory({ type: 'remove', taskId: dependentTaskId, prerequisiteId });
      }
    } catch (err) {
      console.error('Failed to clear dependency:', err);
      refreshGraph();
    }
  }, [canEdit, pushHistory, refreshGraph]);

  // Edge removal handler
  const onEdgesChange = useCallback((changes) => {
    if (!canEdit) {
      // Ignore all edge changes for non-editors
      return;
    }
    changes.forEach(change => {
      if (change.type === 'remove' && change.id) {
        const parts = change.id.split('->');
        if (parts.length === 2) {
          const prerequisiteId = parseInt(parts[0], 10);
          const targetId = parseInt(parts[1], 10);
          if (!isNaN(targetId) && !isNaN(prerequisiteId)) {
            handleClearDependency(targetId, prerequisiteId);
          }
        }
      }
    });
    defaultOnEdgesChange(changes);
  }, [canEdit, defaultOnEdgesChange, handleClearDependency]);

  // Set dependency (drag-to-link) – only if canEdit
  const handleSetDependency = useCallback(async (taskId, dependencyId) => {
    if (!canEdit) return false;
    const tid = parseInt(taskId, 10);
    const prereq = parseInt(dependencyId, 10);
    try {
      const res = await addTaskDependency(tid, prereq);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        alert(`Erreur: ${error.error || res.status}`);
        return false;
      }
      pushHistory({ type: 'add', taskId: tid, prerequisiteId: prereq });
      return true;
    } catch (err) {
      console.error('Failed to update dependency:', err);
      alert('Erreur réseau');
      return false;
    }
  }, [canEdit, pushHistory]);

  // Connect handler – only if canEdit
  const onConnect = useCallback(async (params) => {
    if (!canEdit) return;
    const { source, target } = params;
    setEdges(eds => {
      const filtered = eds.filter(e => e.target !== target);
      return addEdge(
        { ...params, type: 'smoothstep', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
        filtered
      );
    });
    const success = await handleSetDependency(target, source);
    if (!success) {
      setEdges(eds => eds.filter(e => !(e.source === source && e.target === target)));
    } else {
      refreshGraph();
    }
  }, [canEdit, handleSetDependency, refreshGraph, setEdges]);

  // Undo – only if canEdit
  const handleUndo = useCallback(async () => {
    if (!canEdit || historyIndex < 0) return;
    const action = history[historyIndex];
    try {
      const res =
        action.type === 'add'
          ? await removeTaskDependency(action.taskId, action.prerequisiteId)
          : await addTaskDependency(action.taskId, action.prerequisiteId);
      if (!res.ok) throw new Error('Undo failed');
      setHistoryIndex(prev => prev - 1);
      refreshGraph();
    } catch (err) {
      console.error('Undo failed:', err);
      alert('Erreur lors de l\'annulation');
    }
  }, [canEdit, historyIndex, history, refreshGraph]);

  // Focus path
  const { focusNodeIds, dimmedNodeIds } = useMemo(() => {
    if (!selectedNodeId) return { focusNodeIds: new Set(), dimmedNodeIds: new Set() };
    const focus = new Set([selectedNodeId]);
    const ancStack = [selectedNodeId];
    while (ancStack.length > 0) {
      const curr = ancStack.pop();
      const parents = edges.filter((e) => e.target === curr).map((e) => e.source);
      for (const p of parents) {
        if (!focus.has(p)) {
          focus.add(p);
          ancStack.push(p);
        }
      }
    }
    const descStack = edges.filter(e => e.source === selectedNodeId).map(e => e.target);
    let dStack = [...descStack];
    while (dStack.length > 0) {
      const curr = dStack.pop();
      focus.add(curr);
      const children = edges.filter(e => e.source === curr).map(e => e.target);
      children.forEach(child => { if (!focus.has(child)) dStack.push(child); });
    }
    const dimmed = new Set(nodes.map(n => n.id).filter(id => !focus.has(id)));
    return { focusNodeIds: focus, dimmedNodeIds: dimmed };
  }, [selectedNodeId, nodes, edges]);

  const displayNodes = useMemo(() => {
    if (!selectedNodeId) return nodes;
    return nodes.map(node => ({
      ...node,
      style: {
        ...node.style,
        opacity: dimmedNodeIds.has(node.id) ? 0.2 : 1,
        transition: 'opacity 0.3s ease'
      }
    }));
  }, [nodes, selectedNodeId, dimmedNodeIds]);

  const displayEdges = useMemo(() => {
    if (!selectedNodeId) return edges;
    return edges.map(edge => ({
      ...edge,
      style: {
        ...edge.style,
        opacity: (focusNodeIds.has(edge.source) && focusNodeIds.has(edge.target)) ? 1 : 0.1
      }
    }));
  }, [edges, selectedNodeId, focusNodeIds]);

  // UI states
  if (isLoading) {
    return (
      <div style={{
        minHeight: '60vh', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <div style={{ color: '#22d3ee', fontSize: '18px' }}>Chargement du graphe...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        minHeight: '60vh', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <div style={{ color: '#ef4444', fontSize: '18px', textAlign: 'center', padding: '20px' }}>
          <p>{error}</p>
          <button
            onClick={loadGraph}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#22d3ee',
              color: 'var(--c-bg)',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div style={{
        minHeight: '60vh', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'
      }}>
        <div style={{ color: 'var(--c-text3)', fontSize: '18px', textAlign: 'center' }}>
          <p>Aucun projet sélectionné</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>Sélectionnez un projet dans le kanban pour voir sa structure.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '70vh', minHeight: '560px', width: '100%' }}>
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        connectionMode={canEdit ? ConnectionMode.Loose : ConnectionMode.NoConnection}
        fitView
        attributionPosition="bottom-left"
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        elementsSelectable={true}
        edgesFocusable={canEdit}
        deleteKeyCode={canEdit ? 'Delete' : null}
      >
        <Background color="#334155" gap={20} />
        <Controls />
        <MiniMap nodeStrokeColor="#fff" nodeColor="var(--c-surface)" nodeBorderRadius={2} maskColor="rgba(15, 23, 42, 0.8)" />

        {/* Header with Title + Undo (only for editors) */}
        <Panel position="top-left" style={{ padding: '16px' }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '16px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: canEdit ? '420px' : '320px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: canEdit ? 'center' : 'flex-start'
          }}>
            <div>
              <h2 style={{ color: 'var(--c-text)', fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                Structure Map
              </h2>
              <p style={{ color: 'var(--c-text3)', fontSize: '12px', lineHeight: '1.5' }}>
                {canEdit
                  ? 'Visualisez les dépendances entre tâches. Glissez-déposez pour créer des liens. Cliquez sur une tâche pour mettre en évidence son chemin critique.'
                  : 'Visualisation des dépendances entre tâches. Cliquez sur une tâche pour mettre en évidence son chemin critique.'
                }
              </p>
            </div>
            {canEdit && historyIndex >= 0 && (
              <button
                onClick={handleUndo}
                title="Annuler la dernière modification"
                style={{
                  padding: '6px 12px',
                  background: '#f59e0b',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginLeft: '12px',
                  flexShrink: 0
                }}
              >
                ↶ Annuler
              </button>
            )}
          </div>
        </Panel>

        <Panel position="bottom-right" style={{ padding: '16px' }}>
          <div style={{
            background: 'rgba(15, 23, 42, 0.9)',
            backdropFilter: 'blur(8px)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ color: 'var(--c-text)', fontSize: '12px', fontWeight: '700', marginBottom: '8px' }}>Légende</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--c-text3)' }}>
                <div style={{ width: '16px', height: '2px', background: '#22d3ee' }} />
                <span>Libre (Done)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--c-text3)' }}>
                <div style={{ width: '16px', height: '2px', background: '#3b82f6' }} />
                <span>En cours</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--c-text3)' }}>
                <div style={{ width: '16px', height: '2px', background: 'var(--c-text4)', borderStyle: 'dashed' }} />
                <span>Théorique (non démarré)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--c-text3)' }}>
                <div style={{ width: '16px', height: '2px', background: '#ef4444' }} />
                <span>Bloqué (Retard/Rejet)</span>
              </div>
            </div>
          </div>
        </Panel>

        {selectedNodeId && (
          <Panel position="top-right" style={{ padding: '16px' }}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(8px)',
              padding: '12px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: 'var(--c-text3)', fontSize: '12px' }}>
                  {focusNodeIds.size} tâches dans le chemin
                </span>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  style={{
                    padding: '4px 12px',
                    background: '#334155',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'var(--c-text)',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Effacer
                </button>
              </div>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

export default TaskGraphExplorer;
