import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Calendar, AlertCircle, Pencil, Trash2, Plus, Send, Upload, Link, Play, Timer, Eye, Download, Lock, MessageSquare } from 'lucide-react';
import TaskModal from './TaskModal';
import TaskDetailPanel from './TaskDetailPanel';
import { checkDependencyMet } from '../utils/taskHelpers';
import { getApiUrl, authJsonHeaders, enrichBoardTasks, xpToPriority } from '../utils/apiHelpers.js';

const columns = [
  { id: 'todo', title: 'Todo', color: 'var(--c-text4)' },
  { id: 'inProgress', title: 'In Progress', color: '#3b82f6' },
  { id: 'review', title: 'Review', color: '#f59e0b' },
  { id: 'done', title: 'Done', color: '#10b981' }
];

const API_URL = getApiUrl();

async function authDownloadFile(downloadUrl, filename) {
  const token = localStorage.getItem('auth_token');
  const path = downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`;
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('download');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename || 'fichier';
  a.click();
  URL.revokeObjectURL(href);
}

function DeliverableModal({ isOpen, onClose, onSubmit, task }) {
  const [deliverable, setDeliverable] = useState('');
  const [mode, setMode] = useState('link');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      backdropFilter: 'blur(8px)'
    }} onClick={onClose}>
      <div style={{
        background: '#ffffff', borderRadius: '20px', padding: '28px',
        width: '90%', maxWidth: '480px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ color: '#111827', marginBottom: '6px', fontSize: '20px', fontWeight: '700' }}>Livrer le travail</h3>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>Ajouter un livrable pour la tâche.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          <button onClick={() => setMode('link')} style={{
            flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
            background: mode === 'link' ? '#4f46e5' : '#f3f4f6',
            color: mode === 'link' ? '#fff' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>
            <Link size={14} style={{marginRight: 6}}/>Lien
          </button>
          <button onClick={() => setMode('file')} style={{
            flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
            background: mode === 'file' ? '#4f46e5' : '#f3f4f6',
            color: mode === 'file' ? '#fff' : '#6b7280', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>
            <Upload size={14} style={{marginRight: 6}}/>Fichier
          </button>
        </div>

{mode === 'link' && (
          <input
            type="url"
            value={deliverable}
            onChange={e => setDeliverable(e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none',
              marginBottom: '16px', boxSizing: 'border-box'
            }}
          />
        )}
        
        {mode === 'file' && (
          <div>
            <button onClick={() => document.getElementById('file-input').click()} style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none',
              marginBottom: '16px', boxSizing: 'border-box',
              background: '#f3f4f6', color: '#6b7280', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}>
              <Upload size={16} />
              <span>{file ? file.name : 'Choisir un fichier'}</span>
            </button>
            <input
              type="file"
              id="file-input"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files[0]) {
                  setFile(e.target.files[0]);
                  setDeliverable(e.target.files[0].name);
                }
              }}
            />
            {file && (
              <div style={{ marginTop: '12px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
                <span>Fichier sélectionné: {file.name}</span>
                <button onClick={() => {
                  setFile(null);
                  setDeliverable('');
                }} style={{
                  marginLeft: '12px', padding: '4px 8px', background: '#fee2e2', border: 'none',
                  borderRadius: '4px', color: '#dc2626', fontSize: '12px', cursor: 'pointer'
                }}>Supprimer</button>
              </div>
            )}
          </div>
        )}
        
        
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: '600' }}>Annuler</button>
              <button onClick={async () => {
                let deliverableValue = ''
                let deliverableType = ''
                if (mode === 'link') {
                  deliverableValue = deliverable
                  deliverableType = 'url'
                } else if (mode === 'file') {
                  deliverableValue = file
                  deliverableType = 'fichier'
                }
                
                try {
                  setUploading(true)
                  setUploadError('')
                  await onSubmit(task?.id, deliverableValue, deliverableType)
                  setDeliverable('')
                  setFile(null)
                  setUploadError('')
                  onClose()
                } catch (err) {
                  setUploadError('Echec upload: ' + err.message)
                } finally {
                  setUploading(false)
                }
              }}
               disabled={uploading || !(
                (mode === 'link' && deliverable.trim()) ||
                (mode === 'file' && file)
              )} style={{
                flex: 1, padding: '14px', borderRadius: '12px',
                background: uploading ? 'var(--c-text4)' : '#4f46e5', border: 'none', color: '#fff', cursor: 'pointer',
                fontWeight: '600', opacity: (
                  uploading || !(
                  (mode === 'link' && deliverable.trim()) ||
                  (mode === 'file' && file)
                ) ? 0.5 : 1
                )
              }}>Livrer</button>
               {uploadError && <div style={{color: '#ef4444', fontSize: '12px', marginTop: '4px', textAlign: 'center'}}>{uploadError}</div>}
          </div>
        </div>
      </div>
    );
  }

 function KanbanBoard({
   tasks, projects, activeProject, onProjectChange,
  onTaskMove, onDeleteTask, user, onTaskSubmit, teamMembers, onTasksChanged,
  canManageProject = false, myRole,
 }) {
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showDeliverableModal, setShowDeliverableModal] = useState(false);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [permissionHint, setPermissionHint] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState(null);
  const [timerTick, setTimerTick] = useState(0);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  // ── Task detail panel (comments) ──
  const [detailPanelTask, setDetailPanelTask] = useState(null);

  useEffect(() => {
    if (!showValidationModal || !selectedTask?.id) {
      setSelectedTaskDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`${API_URL}/api/tasks/${selectedTask.id}`, { headers: authJsonHeaders() });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (!cancelled) setSelectedTaskDetail(data.task);
    })();
    return () => { cancelled = true; };
  }, [showValidationModal, selectedTask?.id]);

  // Détection du redimensionnement pour responsive
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
    };
    handleResize(); // Appel initial
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isGestionnaire = canManageProject || user?.userRole === 'gestionnaire' || user?.role === 'admin';
  const isMembre = myRole === 'membre';
  const rawDisplayTasks = useMemo(() => enrichBoardTasks(tasks, teamMembers), [tasks, teamMembers]);
  // Membres ne voient que leurs propres tâches assignées
  const displayTasks = useMemo(() => {
    if (!isMembre || !user?.id) return rawDisplayTasks;
    const filterCol = (col) => (col || []).filter(
      (t) => Array.isArray(t.assignees) && t.assignees.some((id) => Number(id) === Number(user.id))
    );
    return {
      todo: filterCol(rawDisplayTasks?.todo),
      inProgress: filterCol(rawDisplayTasks?.inProgress),
      review: filterCol(rawDisplayTasks?.review),
      done: filterCol(rawDisplayTasks?.done),
    };
  }, [rawDisplayTasks, isMembre, user?.id]);
  const allTasks = displayTasks ? Object.values(displayTasks).flat() : [];
  const progress = allTasks.length > 0 ? Math.round(((displayTasks?.done?.length || 0) / allTasks.length) * 100) : 0;

  // Rafraîchissement chaque minute pour les sabliers
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const getHourglassColor = (task) => {
    const due = task.deadline || task.due_date;
    if (!due || !task.created_at) return 'var(--c-text3)';

    const start = new Date(task.created_at).getTime();
    const deadline = new Date(due).getTime();
    const now = Date.now();

    if (now >= deadline) return '#ef4444';

    const totalDuration = deadline - start;
    const remaining = deadline - now;
    const remainingPercentage = (remaining / totalDuration) * 100;

    if (remainingPercentage > 50) return '#22d3ee';
    if (remainingPercentage > 25) return '#f59e0b';
    return '#ef4444';
  };

  const getHourglassPulse = (task) => {
    const due = task.deadline || task.due_date;
    if (!due || !task.created_at) return 'none';
    return Date.now() >= new Date(due).getTime() ? 'pulse' : 'none';
  };

  const isObservateur = myRole === 'observateur';

  const showAdminOnlyHint = () => {
    setPermissionHint("Action reservee a l’admin du projet.");
    setTimeout(() => setPermissionHint(''), 2200);
  };

  const showObservateurHint = () => {
    setPermissionHint('Les observateurs sont en lecture seule.');
    setTimeout(() => setPermissionHint(''), 2200);
  };

  const handleStartTask = async (task) => {
    // Vérification de la dépendance côté client
    const isAvailable = checkDependencyMet(task, allTasks);
    if (!isAvailable) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: authJsonHeaders(),
        body: JSON.stringify({ status: 'in_progress' }),
      });

      if (response.ok) {
        onTasksChanged?.();
      } else {
        const error = await response.json();
        alert(error.error || 'Erreur lors du démarrage de la tâche');
      }
    } catch (error) {
      console.error('Error starting task:', error);
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (isObservateur) { showObservateurHint(); return; }
    onTaskMove(parseInt(result.draggableId), result.source.droppableId, result.destination.droppableId);
  };

  if (!tasks) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--c-text3)' }}>Chargement...</div>;

  return (
    <React.Fragment>
        <DeliverableModal
         isOpen={showDeliverableModal}
         onClose={() => setShowDeliverableModal(false)}
         onSubmit={onTaskSubmit}
         task={selectedTask}
        />

        {/* Panneau détail + commentaires */}
        <TaskDetailPanel
          isOpen={!!detailPanelTask}
          onClose={() => setDetailPanelTask(null)}
          task={detailPanelTask}
          currentUser={user}
          isObservateur={isObservateur}
        />

       {/* Validation Modal - pour que le gestionnaire voie et valide le livrable */}
       {showValidationModal && selectedTask && (
         <div style={{
           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
           display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
           backdropFilter: 'blur(8px)'
         }} onClick={(e) => e.target === e.currentTarget && setShowValidationModal(false)}>
           <div style={{
             background: '#ffffff', borderRadius: '20px', padding: '28px',
             width: '90%', maxWidth: '480px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
             maxHeight: '90vh', overflowY: 'auto'
           }}>
             <h3 style={{ color: '#111827', marginBottom: '6px', fontSize: '20px', fontWeight: '700' }}>
               Révision du travail
             </h3>
             <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '20px' }}>
               Examinez le livrable et validez ou demandez des corrections.
             </p>

             {/* Commentaire de rejet précédent */}
              {selectedTask.status === 'rejected' && (selectedTaskDetail?.description || selectedTask.description) && (
                <div style={{ padding: '12px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fbbf24', marginBottom: '16px' }}>
                  <label style={{ color: '#92400e', fontSize: '12px', fontWeight: '700', display: 'block', marginBottom: '6px' }}>
                    📝 Commentaires / Critiques du gestionnaire :
                  </label>
                  <div style={{ color: '#92400e', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    {(() => {
                      const t = selectedTaskDetail?.description || selectedTask.description || '';
                      return t.includes('---') ? t.split('---').slice(-1)[0].trim() : t;
                    })()}
                  </div>
                </div>
              )}

              {/* Pièces jointes (API) + texte de livraison */}
              {selectedTaskDetail?.attachments?.length > 0 && (
               <div style={{ marginBottom: '24px' }}>
                 <label style={{ color: '#374151', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>
                   📄 Fichiers livrés
                 </label>
                 <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                   {selectedTaskDetail.attachments.map((att) => (
                     <button
                       type="button"
                       key={att.id}
                       onClick={() => authDownloadFile(att.download_url, att.original_filename)}
                       style={{
                         display: 'flex', alignItems: 'center', gap: '8px', padding: '12px',
                         background: 'var(--c-text)', borderRadius: '8px', border: '1px solid #cbd5e1',
                         cursor: 'pointer', textAlign: 'left', color: '#334155',
                       }}
                     >
                       <Download size={20} style={{ color: 'var(--c-text4)' }} />
                       <span style={{ wordBreak: 'break-all' }}>{att.original_filename}</span>
                     </button>
                   ))}
                 </div>
               </div>
             )}

             {(selectedTaskDetail?.description || selectedTask.description) && (
               <div style={{ marginBottom: '24px' }}>
                 <label style={{ color: '#374151', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>
                   📝 Description / livrable texte
                 </label>
                 <div style={{ marginTop: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.6', padding: '12px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                   {selectedTaskDetail?.description || selectedTask.description}
                 </div>
               </div>
             )}

             {!selectedTaskDetail?.attachments?.length && !((selectedTaskDetail?.description || selectedTask.description || '').trim()) && (
               <div style={{ padding: '16px', background: '#fef3c7', borderRadius: '12px', marginBottom: '24px', color: '#92400e' }}>
                 Aucun livrable n'a été fourni. Le membre a peut-être demandé à valider sans preuve.
               </div>
             )}

             {/* Temps passé */}
             {selectedTask.start_time && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: '#f3f4f6', borderRadius: '8px', marginBottom: '24px' }}>
                 <Timer size={16} />
                 <span style={{ fontSize: '14px' }}>
                   Temps passé : {(() => {
                     const start = new Date(selectedTask.start_time).getTime();
                     const now = Date.now();
                     const diffMs = now - start;
                     const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                     const diffDays = Math.floor(diffHours / 24);
                     if (diffDays > 0) return `${diffDays}j ${diffHours % 24}h`;
                     return `${diffHours}h`;
                   })()}
                 </span>
               </div>
             )}

              {/* Actions de validation */}
               {isGestionnaire && (
               <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                 <button
                    onClick={async () => {
                      try {
                        const response = await fetch(`${API_URL}/api/tasks/${selectedTask.id}`, {
                          method: 'PUT',
                          headers: authJsonHeaders(),
                          body: JSON.stringify({ status: 'validated' }),
                        });
                        if (response.ok) {
                          onTasksChanged?.();
                        } else {
                          const err = await response.json().catch(() => ({}));
                          alert('Erreur lors de l\'approbation: ' + (err.error || response.status));
                        }
                      } catch (e) {
                        console.error('Erreur réseau:', e);
                        alert('Erreur réseau');
                      }
                    }}
                    style={{
                      flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                      background: '#10b981', color: '#fff', fontWeight: '700', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                    }}
                  >
                   <span>✅</span> Approuver
                 </button>
  
                 <button
                   onClick={() => setShowRejectForm(true)}
                   style={{
                     flex: 1, padding: '14px', borderRadius: '12px', border: 'none',
                     background: '#ef4444', color: '#fff', fontWeight: '700', cursor: 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                   }}
                 >
                   <span>✖</span> Rejeter
                 </button>
               </div>
               )}

              {/* Formulaire de rejet */}
              {showRejectForm && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ color: '#374151', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    Commentaires / Corrections demandées
                  </label>
                  <textarea
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="Détaillez les corrections nécessaires..."
                    style={{
                      width: '100%', minHeight: '80px', padding: '12px', borderRadius: '8px',
                      border: '1px solid #e5e7eb', fontSize: '14px', outline: 'none', resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={async () => {
                        if (!rejectComment.trim()) {
                          alert('Veuillez saisir un commentaire');
                          return;
                        }
                        try {
                          const ures = await fetch(`${API_URL}/api/tasks/${selectedTask.id}`, {
                            method: 'PUT',
                            headers: authJsonHeaders(),
                            body: JSON.stringify({ status: 'rejected' }),
                          });
                          if (!ures.ok) {
                            const err = await ures.json().catch(() => ({}));
                            alert(err.error || 'Erreur lors du rejet');
                            return;
                          }
                          await fetch(`${API_URL}/api/tasks/${selectedTask.id}/comments`, {
                            method: 'POST',
                            headers: authJsonHeaders(),
                            body: JSON.stringify({ content: rejectComment.trim() }),
                          });
                          onTasksChanged?.();
                        } catch (e) {
                          alert('Erreur réseau');
                        }
                      }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                        background: '#ef4444', color: '#fff', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Confirmer le rejet
                    </button>
                    <button
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectComment('');
                      }}
                      style={{
                        flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #9ca3af',
                        background: '#f3f4f6', color: '#6b7280', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
           </div>
         </div>
       )}

       <style>{`
         @keyframes pulseGlowRed {
           0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
           50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.8); }
         }
         @keyframes blinkAlert {
           0%, 100% { opacity: 1; transform: scale(1); }
           50% { opacity: 0.5; transform: scale(0.95); }
         }
         @keyframes spin {
           to { transform: rotate(360deg); }
         }
       `}</style>

      <div style={{ marginBottom: '24px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px',
          background: 'rgba(30, 41, 59, 0.7)', borderRadius: '20px', border: '1px solid var(--c-border2)'
        }}>
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '30px' }}>
            {projects?.map(p => (
              <button key={p.id} onClick={() => onProjectChange(p)} style={{
                padding: '8px 16px', borderRadius: '30px', border: 'none',
                background: activeProject?.id === p.id ? '#4f46e5' : 'transparent',
                color: activeProject?.id === p.id ? '#fff' : 'var(--c-text3)', cursor: 'pointer', fontWeight: '600', fontSize: '13px'
              }}>{p.name}</button>
            ))}
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ flex: 1, height: '6px', background: 'var(--c-border2)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4f46e5, #7c3aed)', transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#a5b4fc' }}>{progress}%</span>
          </div>
          {isGestionnaire && (
            <button
              onClick={() => setShowTaskForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                borderRadius: '30px', background: '#4f46e5', border: 'none', color: '#fff',
                cursor: 'pointer', fontWeight: '600',
              }}
            >
              <Plus size={16} />Nouvelle
            </button>
          )}
        </div>
        {permissionHint && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#fbbf24' }}>{permissionHint}</div>
        )}
      </div>

{showTaskForm && (
         <TaskModal
           isOpen={showTaskForm}
           onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
           onSubmit={async (taskData) => {
             try {
               const deadlineIso = taskData.deadline
                 ? new Date(taskData.deadline).toISOString()
                 : null;
               const assignees = taskData.assignee_id ? [taskData.assignee_id] : [];
               const priority = xpToPriority(taskData.xp ?? 30);
               const basePayload = {
                 title: taskData.title,
                 description: taskData.description || '',
                 deadline: deadlineIso,
                 priority,
                 assignees,
               };
               if (taskData.id && editingTask) {
                 const res = await fetch(`${API_URL}/api/tasks/${taskData.id}`, {
                   method: 'PUT',
                   headers: authJsonHeaders(),
                   body: JSON.stringify(basePayload),
                 });
                 if (!res.ok) console.error('Failed to update task:', await res.text());
                else onTasksChanged?.();
                 return;
               }
              const res = await fetch(`${API_URL}/api/tasks/`, {
                 method: 'POST',
                 headers: authJsonHeaders(),
                 body: JSON.stringify({
                   project_id: activeProject?.id,
                   ...basePayload,
                   status: 'assigned',
                 }),
               });
               if (!res.ok) {
                 console.error('Failed to create task:', await res.text());
                 return;
               }
               const body = await res.json().catch(() => ({}));
               const newId = body.task?.id;
               const dep = taskData.dependency_id ? parseInt(taskData.dependency_id, 10) : null;
               if (newId && dep && !Number.isNaN(dep)) {
                 await fetch(`${API_URL}/api/tasks/${newId}/dependencies`, {
                   method: 'POST',
                   headers: authJsonHeaders(),
                   body: JSON.stringify({ prerequisite_task_id: dep }),
                 });
               }
              onTasksChanged?.();
             } catch (error) {
               console.error('Error saving task:', error);
             }
           }}
           task={editingTask}
           project={activeProject}
           teamMembers={teamMembers?.filter(m => m.role !== 'observateur').map(m => ({ id: m.id, name: m.nom || m.name, role: m.role })) || []}
           allTasks={allTasks}
           mode={editingTask ? 'edit' : 'create'}
         />
       )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 240px)', overflowX: 'auto', paddingBottom: '10px' }}>
          {columns.map(column => (
            <Droppable key={column.id} droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  style={{
                    flex: 1, minWidth: '280px', background: snapshot.isDraggingOver ? 'rgba(30, 41, 59, 0.6)' : 'rgba(15, 23, 42, 0.4)',
                    borderRadius: '20px', padding: '16px', display: 'flex', flexDirection: 'column',
                    border: '1px solid var(--c-hover)', position: 'relative', transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: column.color }} />
                      <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--c-text)', textTransform: 'uppercase' }}>{column.title}</span>
                    </div>
                    <span style={{ background: 'var(--c-border2)', color: 'var(--c-text3)', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' }}>
                      {displayTasks[column.id]?.length || 0}
                    </span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '100px' }}>
                    {displayTasks[column.id]?.map((task, index) => (
                      <Draggable key={task.id} draggableId={String(task.id)} index={index}>
                        {(provided, snapshot) => (
                           <div
                             ref={provided.innerRef}
                             {...provided.draggableProps}
                             {...provided.dragHandleProps}
                             onClick={() => setDetailPanelTask(task)}
                             style={{
                              ...provided.draggableProps.style,
                              background: snapshot.isDragging ? 'var(--c-surface)' : 'var(--c-surface2)',
                              borderRadius: '16px', padding: '16px',
                              border: `1px solid ${snapshot.isDragging ? '#4f46e5' : 'rgba(255,255,255,0.08)'}`,
                              zIndex: snapshot.isDragging ? 9999 : 1,
                              transform: snapshot.isDragging ? `${provided.draggableProps.style.transform} rotate(2deg)` : provided.draggableProps.style.transform,
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--c-text)', flex: 1, minWidth: 0, marginRight: '8px' }}>{task.title}</span>
                              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                {/* Voir détails + commentaires */}
                                <button
                                  onClick={e => { e.stopPropagation(); setDetailPanelTask(task); }}
                                  title="Voir les détails et commentaires"
                                  style={{ background: 'none', border: 'none', color: 'var(--c-text4)', cursor: 'pointer', padding: '2px' }}
                                >
                                  <MessageSquare size={12}/>
                                </button>
                                {isGestionnaire && (
                                  <>
                                    <button onClick={e => { e.stopPropagation(); setEditingTask(task); setShowTaskForm(true); }} style={{ background: 'none', border: 'none', color: 'var(--c-text4)', cursor: 'pointer', padding: '2px' }}><Pencil size={12}/></button>
                                    <button onClick={e => { e.stopPropagation(); onDeleteTask(task.id, column.id); }} style={{ background: 'none', border: 'none', color: 'var(--c-text4)', cursor: 'pointer', padding: '2px' }}><Trash2 size={12}/></button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                              {/* Indicateur de priorité */}
                              {isMobile ? (
                                <span
                                  title={`Priorité: ${task.priority}`}
                                  style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#3b82f6',
                                    display: 'inline-block',
                                    flexShrink: 0,
                                    cursor: 'help'
                                  }}
                                />
                              ) : (
                                <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: 'rgba(79,70,229,0.1)', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {task.priority === 'high' && <AlertCircle size={10} />} {task.priority}
                                </span>
                              )}
                              
{/* Bouton Démarrer - seulement pour l'assigné sur les tâches TODO */}
                               {column.id === 'todo' && task.assignee_id === user?.id && (
                                 <button 
                                   onClick={(e) => { e.stopPropagation(); handleStartTask(task); }}
                                   style={{ 
                                     padding: '4px 10px', 
                                     borderRadius: '6px', 
                                     fontSize: '10px', 
                                     fontWeight: '700', 
                                     background: checkDependencyMet(task, allTasks) ? 'linear-gradient(135deg, #22d3ee, #0891b2)' : 'rgba(148, 163, 184, 0.2)', 
                                     color: '#fff', 
                                     border: 'none', 
                                     cursor: checkDependencyMet(task, allTasks) ? 'pointer' : 'not-allowed',
                                     display: 'flex',
                                     alignItems: 'center',
                                     gap: '4px'
                                   }}
                                   disabled={!checkDependencyMet(task, allTasks)}
                                 >
                                   <Play size={10} fill="currentColor"/>
                                   {checkDependencyMet(task, allTasks) ? 'Démarrer' : 'Bloqué'}
                                 </button>
                               )}
                               
                               {/* Indicateur de dépendance */}
                               {task.dependency_id && (
                                 isMobile ? (
                                   <div
                                     title={`Dépend de la tâche #${task.dependency_id}`}
                                     style={{
                                       padding: '2px',
                                       borderRadius: '50%',
                                       background: checkDependencyMet(task, allTasks) ? 'rgba(34, 211, 238, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                       color: checkDependencyMet(task, allTasks) ? '#22d3ee' : '#ef4444',
                                       fontSize: '10px',
                                       display: 'flex',
                                       alignItems: 'center',
                                       justifyContent: 'center',
                                       width: '16px',
                                       height: '16px',
                                       flexShrink: 0
                                     }}
                                   >
                                     <Lock size={10} />
                                   </div>
                                 ) : (
                                   <div
                                     title={`Dépend de la tâche #${task.dependency_id}`}
                                     style={{
                                       padding: '2px 6px',
                                       borderRadius: '4px',
                                       background: checkDependencyMet(task, allTasks) ? 'rgba(34, 211, 238, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                       color: checkDependencyMet(task, allTasks) ? '#22d3ee' : '#ef4444',
                                       fontSize: '10px',
                                       display: 'flex',
                                       alignItems: 'center',
                                       gap: '4px'
                                     }}
                                   >
                                     <Lock size={10} />
                                     <span>#{task.dependency_id}</span>
                                   </div>
                                 )
                               )}
                              
                              {/* Sablier intelligent pour tâches en cours (basé sur deadline) */}
                              {column.id === 'inProgress' && (task.deadline || task.due_date) && (
                                <div style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: `rgba(${getHourglassColor(task) === '#22d3ee' ? '34,211,238,0.15' : getHourglassColor(task) === '#f59e0b' ? '245,158,11,0.15' : '239,68,68,0.15'})`,
                                  border: `1px solid ${getHourglassColor(task)}`,
                                  color: getHourglassColor(task),
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  animation: getHourglassPulse(task) === 'pulse' ? 'pulseGlowRed 1.5s ease-in-out infinite' : 'none',
                                  transition: 'all 0.3s ease'
                                }}>
                                  <Timer size={12} style={{ animation: 'spin 3s linear infinite' }} />
                                  <span>En cours</span>
                                </div>
                              )}
                              
                                {/* Badge de tâche rejetée */}
                                {task.status === 'rejected' && (
                                  isMobile ? (
                                    <div
                                      onClick={e => { e.stopPropagation(); setSelectedTask(task); setShowValidationModal(true); }}
                                      title="Rejetée - Voir critique"
                                      style={{
                                        padding: '2px',
                                        borderRadius: '50%',
                                        background: '#ef4444',
                                        color: '#fff',
                                        width: '18px',
                                        height: '18px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        animation: 'blinkAlert 1.5s ease-in-out infinite',
                                        marginBottom: '6px',
                                        flexShrink: 0
                                      }}
                                    >
                                      <AlertCircle size={12} />
                                    </div>
                                  ) : (
                                    <div
                                      onClick={e => { e.stopPropagation(); setSelectedTask(task); setShowValidationModal(true); }}
                                      style={{
                                        padding: '2px 6px', borderRadius: '4px',
                                        background: '#fecaca', color: '#991b1b',
                                        fontSize: '10px', fontWeight: '700', marginBottom: '6px',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <span>✖</span> Rejetée - Voir critique
                                    </div>
                                  )
                                )}

                                {/* Bouton Livrer — visible aussi sur les tâches rejetées pour permettre une re-livraison */}
                                {(task.status === 'in_progress' || task.status === 'rejected') && task.assignee_id === user?.id && !isObservateur && (
                                  <button onClick={e => { e.stopPropagation(); setSelectedTask(task); setShowDeliverableModal(true); }} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: task.status === 'rejected' ? '#f59e0b' : '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer', marginRight: '4px' }}>
                                    <Send size={10} style={{marginRight: 4}}/>{task.status === 'rejected' ? 'Re-livrer' : 'Livrer'}
                                  </button>
                                )}
                               {column.id === 'review' && isGestionnaire && task.status === 'delivered' && (
                                 <button onClick={e => { e.stopPropagation(); setSelectedTask(task); setShowValidationModal(true); }} style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '700', background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                   <Eye size={10} style={{marginRight: 4}}/>Voir le travail
                                 </button>
                               )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px' }}>
                                  {(task.assignee_name || 'N').charAt(0)}
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--c-text3)' }}>{task.assignee_name}</span>
                              </div>
                              {(task.deadline || task.due_date) && <div style={{ fontSize: '10px', color: 'var(--c-text4)' }}><Calendar size={10}/> {task.deadline || task.due_date}</div>}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </React.Fragment>
  );
}

export default KanbanBoard;