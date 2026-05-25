import { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Download,
  Upload,
  Folder,
  File,
  AlertCircle,
  Image as ImageIcon,
  Link2,
  Search,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import {
  listChatAttachments,
  deleteChatAttachment,
  deleteTaskAttachment,
  fetchProjectTasksKanban,
  getApiUrl,
} from '../services/backendApi.js';
import { flattenKanbanTasks, authJsonHeaders } from '../utils/apiHelpers.js';

export default function ResourceCenter({ user, projectId, myRole }) {
   const [resources, setResources] = useState([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(null);
   const [uploading, setUploading] = useState(false);
   const [uploadProgress, setUploadProgress] = useState(0);
   const [searchQuery, setSearchQuery] = useState('');
   const [activeTab, setActiveTab] = useState('manual');
   const fileInputRef = useRef(null);
   const isGestionnaire = user?.userRole === 'gestionnaire' || user?.role === 'admin';
   const isObservateur = myRole === 'observateur';

   const fetchResources = async () => {
     try {
       setLoading(true);
       setError(null);
       if (!projectId) {
         setResources([]);
         return;
       }

      const chatData = await listChatAttachments(projectId);
      const chatRows = chatData?.attachments || [];
      const manual = chatRows.map((a) => ({
        id: `chat-${a.id}`,
        _kind: 'chat',
        attachmentId: a.id,
        title: a.original_filename,
        category: 'manuel',
        created_at: a.created_at,
        download_path: a.download_url,
        url: null,
        canDelete: Boolean(user?.id && a.uploaded_by_id === user.id),
      }));

      const tasksPayload = await fetchProjectTasksKanban(projectId);
      const flat = flattenKanbanTasks(tasksPayload || {});
      const withMaybeFiles = flat.filter((t) =>
        ['delivered', 'validated', 'in_progress'].includes(t.status)
      );
      const slice = withMaybeFiles.slice(0, 50);

      const livrableParts = await Promise.all(
        slice.map(async (t) => {
          const res = await fetch(`${getApiUrl()}/api/tasks/${t.id}`, {
            headers: authJsonHeaders(),
          });
          if (!res.ok) return [];
          const body = await res.json();
          const td = body.task;
          const results = [];

          // ── Pièces jointes (fichiers uploadés) ──────────────────────────────
          if (td?.attachments?.length) {
            td.attachments.forEach((att) => {
              results.push({
                id: `task-${td.id}-att-${att.id}`,
                _kind: 'task_att',
                attachmentId: att.id,
                taskId: td.id,
                title: att.original_filename,
                category: 'livrable',
                created_at: att.created_at,
                download_path: att.download_url,
                url: null,
                source_task_id: td.id,
                source_task_title: td.title,
              });
            });
          }

          // ── Livrable URL (stocké dans la description) ───────────────────────
          if (td?.description) {
            const urlMatch = td.description.match(/^Livrable \(URL\):\s*(.+)$/m);
            if (urlMatch) {
              const href = urlMatch[1].trim();
              results.push({
                id: `task-${td.id}-url`,
                _kind: 'task_url',
                taskId: td.id,
                title: href,
                category: 'livrable',
                created_at: td.updated_at || td.created_at,
                download_path: null,
                url: href,
                source_task_id: td.id,
                source_task_title: td.title,
              });
            } else if (
              // Rapport texte : tâche livrée/validée dont la description n'est pas une URL
              ['delivered', 'validated'].includes(td.status) &&
              td.description.trim().length > 0 &&
              !td.description.startsWith('http')
            ) {
              results.push({
                id: `task-${td.id}-rapport`,
                _kind: 'task_rapport',
                taskId: td.id,
                title: td.description.slice(0, 80) + (td.description.length > 80 ? '…' : ''),
                category: 'livrable',
                created_at: td.updated_at || td.created_at,
                download_path: null,
                url: null,
                isRapport: true,
                rapportContent: td.description,
                source_task_id: td.id,
                source_task_title: td.title,
              });
            }
          }

          return results;
        })
      );
      const livrables = livrableParts.flat();

      setResources([...manual, ...livrables]);
    } catch (err) {
      setError(err.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
     fetchResources();
   }, [projectId]);

const handleFileUpload = async (event) => {
     const file = event.target.files[0];
     if (!file || !projectId) return;

     setUploading(true);
     setUploadProgress(0);

     try {
       const xhr = new XMLHttpRequest();
       const fd = new FormData();
       fd.append('file', file);

       xhr.upload.addEventListener('progress', (e) => {
         if (e.lengthComputable) {
           setUploadProgress(Math.round((e.loaded * 100) / e.total));
         }
       });

       xhr.addEventListener('load', () => {
         setUploading(false);
         setUploadProgress(0);
         if (xhr.status === 201) {
           fetchResources();
         } else {
           setError("Échec de l'upload (vérifiez la taille du fichier et vos droits)");
         }
       });

       xhr.addEventListener('error', () => {
         setUploading(false);
         setUploadProgress(0);
         setError('Erreur réseau lors de l\'upload');
       });

       const token = localStorage.getItem('auth_token');
       xhr.open('POST', `${getApiUrl()}/api/messages/project/${projectId}/attachments`);
       xhr.setRequestHeader('Authorization', `Bearer ${token}`);
       xhr.send(fd);
     } catch (err) {
       setError(err.message);
       setUploading(false);
       setUploadProgress(0);
     }
     event.target.value = '';
   };

  const handleDownload = async (resource) => {
    try {
      if (resource.url) {
        window.open(resource.url, '_blank');
        return;
      }
      const path = resource.download_path;
      if (!path) return;
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${getApiUrl()}${path.startsWith('/') ? path : `/${path}`}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = resource.title || 'fichier';
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      console.error('Download error:', err);
      setError('Impossible de télécharger le fichier');
    }
  };

  const handleDelete = async (resource) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette ressource ?')) return;

    try {
      if (resource._kind === 'chat') {
        const res = await deleteChatAttachment(resource.attachmentId);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Suppression refusée');
        }
      } else if (resource._kind === 'task_att') {
        const res = await deleteTaskAttachment(resource.taskId, resource.attachmentId);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Suppression refusée');
        }
      }
      fetchResources();
    } catch (err) {
      setError(err.message);
    }
  };

  const getFileIcon = (fileName, isUrl, isRapport) => {
    if (isRapport) return <FileText className="w-8 h-8 text-indigo-400" />;
    if (isUrl) return <Link2 className="w-8 h-8 text-cyan-400" />;
    if (!fileName) return <File className="w-8 h-8 text-cyan-400" />;
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext)) return <FileText className="w-8 h-8 text-red-400" />;
    if (['doc', 'docx'].includes(ext)) return <FileText className="w-8 h-8 text-blue-400" />;
    if (['xls', 'xlsx'].includes(ext)) return <FileText className="w-8 h-8 text-green-400" />;
    if (['ppt', 'pptx'].includes(ext)) return <FileText className="w-8 h-8 text-orange-400" />;
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return <ImageIcon className="w-8 h-8 text-purple-400" />;
    return <File className="w-8 h-8 text-cyan-400" />;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getOriginLabel = (resource) => {
    if (resource.category === 'livrable') {
      const kind = resource._kind === 'task_url'
        ? 'Lien livré'
        : resource._kind === 'task_rapport'
          ? 'Rapport livré'
          : 'Fichier livré';
      return `${kind} · ${resource.source_task_title || 'Tâche #' + resource.source_task_id}`;
    }
    return 'Fichier du projet (chat / ressources)';
  };

  const filteredResources = resources.filter(resource => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = resource.title?.toLowerCase().includes(q) ||
                         resource.source_task_title?.toLowerCase().includes(q);
    
    if (activeTab === 'manual') {
      return matchesSearch && resource.category === 'manuel';
    } else {
      return matchesSearch && resource.category === 'livrable';
    }
  });

  const manualResources = resources.filter(r => r.category === 'manuel');
  const livrableResources = resources.filter(r => r.category === 'livrable');

  if (error) {
    return (
      <div style={{
        minHeight: '60vh',
        background: 'var(--c-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div style={{
          maxWidth: '500px',
          width: '100%',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '16px',
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <AlertCircle style={{
              width: '32px',
              height: '32px',
              color: '#ef4444'
            }} />
            <h3 style={{
              color: '#ef4444',
              fontSize: '20px',
              fontWeight: '700'
            }}>Erreur de chargement</h3>
          </div>
          <p style={{
            color: '#fca5a5',
            marginBottom: '16px',
            lineHeight: '1.6'
          }}>{error}</p>
          <button
            onClick={fetchResources}
            style={{
              width: '100%',
              padding: '12px 24px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100%',
      background: 'var(--c-bg)',
      color: 'var(--c-text)'
    }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      {/* Header */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          maxWidth: '1140px',
          margin: '0 auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div>
            <h1 style={{
              fontSize: '32px',
              fontWeight: '700',
              background: 'linear-gradient(90deg, #22d3ee, #0891b2)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent'
            }}>
              Centre de Ressources
            </h1>
            <p style={{
              color: 'var(--c-text3)',
              marginTop: '4px'
            }}>
              Hub central pour les documents et livrables validés
            </p>
          </div>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: '16px'
          }}>
            <button
              onClick={() => setActiveTab('manual')}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: activeTab === 'manual' ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
                border: activeTab === 'manual' ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid transparent',
                color: activeTab === 'manual' ? '#22d3ee' : 'var(--c-text3)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Documentation & Liens ({manualResources.length})
            </button>
            <button
              onClick={() => setActiveTab('livrable')}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                background: activeTab === 'livrable' ? 'rgba(34, 211, 238, 0.15)' : 'transparent',
                border: activeTab === 'livrable' ? '1px solid rgba(34, 211, 238, 0.3)' : '1px solid transparent',
                color: activeTab === 'livrable' ? '#22d3ee' : 'var(--c-text3)',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Livrables Validés ({livrableResources.length})
            </button>
          </div>

          {/* Search and Upload */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{
              flex: 1,
              minWidth: '200px',
              position: 'relative'
            }}>
              <Search style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '18px',
                height: '18px',
                color: 'var(--c-text4)'
              }} />
              <input
                type="text"
                placeholder="Rechercher un document..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '40px',
                  paddingRight: '12px',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  borderRadius: '8px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--c-text)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>
            
{isGestionnaire && activeTab === 'manual' && (
               <>
                 <button
                   onClick={() => fileInputRef.current?.click()}
                   disabled={uploading}
                   style={{
                     padding: '10px 20px',
                     borderRadius: '8px',
                     background: 'rgba(34, 211, 238, 0.1)',
                     border: '1px solid rgba(34, 211, 238, 0.3)',
                     color: '#22d3ee',
                     cursor: 'pointer',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '8px',
                     transition: 'all 0.3s ease'
                   }}
                   onMouseEnter={e => {
                     if (!uploading) {
                       e.currentTarget.style.background = 'rgba(34, 211, 238, 0.2)';
                     }
                   }}
                   onMouseLeave={e => {
                     if (!uploading) {
                       e.currentTarget.style.background = 'rgba(34, 211, 238, 0.1)';
                     }
                   }}
                 >
                   {uploading ? (
                     <div style={{
                       width: '16px',
                       height: '16px',
                       border: '2px solid rgba(255,255,255,0.3)',
                       borderTopColor: '#22d3ee',
                       borderRadius: '50%',
                       animation: 'spin 1s linear infinite'
                     }} />
                   ) : (
                     <Upload style={{ width: '16px', height: '16px' }} />
                   )}
                   <span style={{ fontWeight: '600' }}>
                     {uploading ? `Upload ${uploadProgress}%` : 'Ajouter un document'}
                   </span>
                 </button>
               </>
             )}
           </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{
        maxWidth: '1140px',
        margin: '0 auto',
        padding: '32px 24px'
      }}>
        {loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 24px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid rgba(34, 211, 238, 0.2)',
              borderTopColor: '#22d3ee',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ color: 'var(--c-text3)', marginTop: '16px' }}>Chargement des ressources...</p>
          </div>
        ) : filteredResources.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 24px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              color: 'var(--c-text5)',
              marginBottom: '16px'
            }}>
              <Folder style={{ width: '100%', height: '100%' }} />
            </div>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#cbd5e1',
              marginBottom: '8px'
            }}>
              Aucune ressource trouvée
            </h3>
            <p style={{
              color: 'var(--c-text4)',
              maxWidth: '400px',
              lineHeight: '1.6'
            }}>
              {searchQuery 
                ? "Aucun document ne correspond à votre recherche."
                : activeTab === 'manual'
                  ? isGestionnaire 
                    ? "Commencez par ajouter des documents dans l'onglet Documentation & Liens."
                    : "Aucune documentation n'a été ajoutée par le gestionnaire."
                  : "Aucun livrable validé pour le moment. Les tâches terminées et validées apparaîtront ici."
              }
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            {filteredResources.map((resource) => (
              <div key={resource.id} style={{
                background: 'rgba(30, 41, 59, 0.4)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(34, 211, 238, 0.1)',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'border-color 0.3s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.3)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.1)';
              }}
              >
                {/* Header with icon and actions */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <div style={{
                    padding: '8px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    borderRadius: '8px',
                    border: '1px solid rgba(34, 211, 238, 0.2)'
                  }}>
                    {getFileIcon(resource.title, !!resource.url, resource.isRapport)}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {resource.isRapport ? (
                      <button
                        onClick={() => alert(resource.rapportContent)}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          background: 'rgba(99, 102, 241, 0.1)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          color: '#818cf8',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        title="Voir le rapport"
                      >
                        <FileText style={{ width: '16px', height: '16px' }} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDownload(resource)}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          background: 'rgba(34, 211, 238, 0.1)',
                          border: '1px solid rgba(34, 211, 238, 0.2)',
                          color: '#22d3ee',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        title={resource.url ? "Ouvrir le lien" : "Télécharger"}
                      >
                        {resource.url ? <ExternalLink style={{ width: '16px', height: '16px' }} /> : <Download style={{ width: '16px', height: '16px' }} />}
                      </button>
                    )}
                    
                    {((resource._kind === 'chat' && resource.canDelete) ||
                      (resource._kind === 'task_att' && isGestionnaire)) && (
                      <button
                        onClick={() => handleDelete(resource)}
                        style={{
                          padding: '6px',
                          borderRadius: '6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        title="Supprimer"
                      >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title */}
                <h3 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--c-text)',
                  margin: 0,
                  wordBreak: 'break-word'
                }}>
                  {resource.title || resource.file_path || 'Sans titre'}
                </h3>

                {/* Origin badge */}
                <span style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '600',
                  background: resource.category === 'livrable' 
                    ? 'rgba(34, 211, 238, 0.1)' 
                    : 'rgba(168, 85, 247, 0.1)',
                  color: resource.category === 'livrable' ? '#22d3ee' : '#a855f7',
                  alignSelf: 'flex-start'
                }}>
                  {getOriginLabel(resource)}
                </span>

                {/* Date */}
                <p style={{
                  fontSize: '12px',
                  color: 'var(--c-text4)',
                  margin: 0
                }}>
                  Ajouté le {formatDate(resource.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

{/* Hidden file input */}
       <input
         ref={fileInputRef}
         type="file"
         onChange={handleFileUpload}
         style={{ display: 'none' }}
       />
     </div>
   );
}