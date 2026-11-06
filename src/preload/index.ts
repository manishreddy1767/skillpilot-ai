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
  getDashboard: () => ipcRenderer.invoke(Channel.GetDashboard)
}

contextBridge.exposeInMainWorld('skillpilot', api)
