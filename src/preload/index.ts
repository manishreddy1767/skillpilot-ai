import { contextBridge, ipcRenderer } from 'electron'
import { Channel, type SkillPilotApi } from '../shared/ipc'

const api: SkillPilotApi = {
  dragPress: (grabOffset) => ipcRenderer.send(Channel.DragPress, grabOffset),
  dragMove: () => ipcRenderer.send(Channel.DragMove),
  dragRelease: () => ipcRenderer.send(Channel.DragRelease),
  hoverEnter: () => ipcRenderer.send(Channel.HoverEnter),
  hoverLeave: () => ipcRenderer.send(Channel.HoverLeave),
  openApp: () => ipcRenderer.send(Channel.OpenApp),
  minimizeToWidget: () => ipcRenderer.send(Channel.MinimizeToWidget)
}

contextBridge.exposeInMainWorld('skillpilot', api)
