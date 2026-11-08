import { contextBridge, ipcRenderer } from 'electron'
import { Channel, type SkillPilotApi } from '../shared/ipc'

const api: SkillPilotApi = {
  dragPress: (grabOffset) => ipcRenderer.send(Channel.DragPress, grabOffset),
  dragMove: () => ipcRenderer.send(Channel.DragMove),
  dragRelease: () => ipcRenderer.send(Channel.DragRelease),
  hoverEnter: () => ipcRenderer.send(Channel.HoverEnter),
  hoverLeave: () => ipcRenderer.send(Channel.HoverLeave),
  openApp: () => ipcRenderer.send(Channel.OpenApp),
  minimizeToWidget: () => ipcRenderer.send(Channel.MinimizeToWidget),
  getOverview: () => ipcRenderer.invoke(Channel.GetOverview),
  onOverviewChanged: (listener) => {
    // The event object is kept here, so renderers never receive ipcRenderer through it.
    const forward = (): void => listener()
    ipcRenderer.on(Channel.OverviewChanged, forward)
    return () => void ipcRenderer.removeListener(Channel.OverviewChanged, forward)
  },
  getProfile: () => ipcRenderer.invoke(Channel.GetProfile),
  saveProfile: (values) => ipcRenderer.invoke(Channel.SaveProfile, values),
  listRecords: (kind, parentId) => ipcRenderer.invoke(Channel.ListRecords, kind, parentId),
  saveRecord: (kind, id, values, parentId) =>
    ipcRenderer.invoke(Channel.SaveRecord, kind, id, values, parentId),
  deleteRecord: (kind, id, parentId) => ipcRenderer.invoke(Channel.DeleteRecord, kind, id, parentId),
  listLinks: (kind, parentId) => ipcRenderer.invoke(Channel.ListLinks, kind, parentId),
  setLink: (kind, parentId, childId, linked, level) =>
    ipcRenderer.invoke(Channel.SetLink, kind, parentId, childId, linked, level),
  getDashboard: () => ipcRenderer.invoke(Channel.GetDashboard),
  getSettings: () => ipcRenderer.invoke(Channel.GetSettings),
  saveSettings: (values) => ipcRenderer.invoke(Channel.SaveSettings, values),
  getAiStatus: () => ipcRenderer.invoke(Channel.GetAiStatus),
  saveApiKey: (key) => ipcRenderer.invoke(Channel.SaveApiKey, key),
  removeApiKey: () => ipcRenderer.invoke(Channel.RemoveApiKey),
  getChat: () => ipcRenderer.invoke(Channel.GetChat),
  sendChat: (message) => ipcRenderer.invoke(Channel.SendChat, message),
  clearChat: () => ipcRenderer.invoke(Channel.ClearChat),
  getGapAnalysis: (roleId) => ipcRenderer.invoke(Channel.GetGapAnalysis, roleId),
  draftRequirements: (roleId) => ipcRenderer.invoke(Channel.DraftRequirements, roleId),
  createGapReport: (roleId) => ipcRenderer.invoke(Channel.CreateGapReport, roleId),
  generateRoadmap: (roleId) => ipcRenderer.invoke(Channel.GenerateRoadmap, roleId),
  suggestTasks: () => ipcRenderer.invoke(Channel.SuggestTasks),
  listProposals: () => ipcRenderer.invoke(Channel.ListProposals),
  acceptProposal: (id) => ipcRenderer.invoke(Channel.AcceptProposal, id),
  rejectProposal: (id) => ipcRenderer.invoke(Channel.RejectProposal, id),
  getAiLog: () => ipcRenderer.invoke(Channel.GetAiLog),
  getLearning: () => ipcRenderer.invoke(Channel.GetLearning),
  getRecommendation: () => ipcRenderer.invoke(Channel.GetRecommendation),
  getRoleReadiness: () => ipcRenderer.invoke(Channel.GetRoleReadiness),
  completeTask: (id) => ipcRenderer.invoke(Channel.CompleteTask, id),
  rescheduleRoadmap: (id) => ipcRenderer.invoke(Channel.RescheduleRoadmap, id),
  exportData: () => ipcRenderer.invoke(Channel.ExportData),
  importData: () => ipcRenderer.invoke(Channel.ImportData),
  listBackups: () => ipcRenderer.invoke(Channel.ListBackups),
  restoreBackup: (name) => ipcRenderer.invoke(Channel.RestoreBackup, name),
  eraseAll: (confirmation) => ipcRenderer.invoke(Channel.EraseAll, confirmation),
  getHistory: () => ipcRenderer.invoke(Channel.GetHistory),
  suggestProjects: () => ipcRenderer.invoke(Channel.SuggestProjects),
  listen: () => ipcRenderer.invoke(Channel.Listen),
  stopListening: () => ipcRenderer.invoke(Channel.StopListening),
  onVoiceReady: (listener) => {
    const forward = (): void => listener()
    ipcRenderer.on(Channel.VoiceReady, forward)
    return () => void ipcRenderer.removeListener(Channel.VoiceReady, forward)
  }
}

contextBridge.exposeInMainWorld('skillpilot', api)
