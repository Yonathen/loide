import { EditorState } from './../navigation.service';
import { Component, OnInit, ViewChild, HostListener, ElementRef } from '@angular/core';
import { EventSidebar } from './model/event-sidebar';
import { ScriptLoaderService } from './services/script-loader.service';
import { NavigationService } from 'src/app/navigation.service';
import { MenuItem, TreeNode } from 'primeng/api';
import { AceEditorComponent } from 'ng2-ace-editor';
import { ActivatedRoute } from '@angular/router';
import { DocumentService } from '../documents/services/document.service';
import { FileFolder, FileType, AccessType } from 'api/server/models/file-folder';
import { LoideRoute } from '../shared/enums/loide-route';
import { NgxSpinnerService } from 'ngx-spinner';
import { LoideToolbarItems } from './enums/loide-toolbar-items.enum';
import { util } from 'api/server/lib/util';

export const EditorTabTag = 'EDITOR_TAB_';

enum ResizePanel {
  Left = 'Left',
  Right = 'Right',
  Bottom = 'Bottom',
  None = 'None'
}

interface MousePosition {
  x: number;
  y: number;
}

@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class EditorComponent implements OnInit {
  public loggedUserId: string;
  public content: any;
  public sidebarEvent: EventSidebar;
  public sidebarLeft: boolean;
  public sidebarRight: boolean;
  public editorState: EditorState;
  public documentChanged: boolean;
  public editorMenuItems: MenuItem[] = [];

  public widthBody: number;
  public widthBarLeft: number = 40;
  public widthBarRight: number = 40;
  public heightBarBottom: number = 40;

  public mouse: MousePosition = { x : 0, y : 0};
  public activeResize: ResizePanel = ResizePanel.None;
  public resizeOpt = ResizePanel;
  public openSidebarLeftByResize: boolean = false;

  public breadcrumbItems: MenuItem[] = [];
  public publicDocuments: TreeNode[] = [];
  public privateDocuments: TreeNode[] = [];

  @ViewChild('editorWrap') editorWrap: ElementRef;

  @ViewChild('editor', { static: true }) editor: AceEditorComponent;

  constructor(
    private activatedRoute: ActivatedRoute,
    private documentService: DocumentService,
    private spinner: NgxSpinnerService,
    private navigationService: NavigationService,
    private scriptLoaderService: ScriptLoaderService) {}

  public get winHeight() {
    return window.innerHeight;
  }

  public get winWidth() {
    return window.innerWidth;
  }

  get sidebarLeftVisible(): boolean {
    return this.sidebarLeft;
  }

  get sidebarRightVisible(): boolean {
    return this.sidebarRight;
  }

  ngOnInit(): void {
    this.loggedUserId = Meteor.userId();
    this.loadPrivateDocument();
    this.loadPublicDocument();

    this.activatedRoute.queryParamMap.subscribe(queryParams => {
      const documentId: string = queryParams.get('item');
      this.getDocumentById(documentId);
    });

    this.navigationService.menu.subscribe( menuItems => {
      this.editorMenuItems.splice(0, this.editorMenuItems.length);
      menuItems.forEach(item => {
        this.editorMenuItems.push(item);
      });
    });

    this.navigationService.active.subscribe(activeState => {
      this.editorState = activeState;
    });
    this.setBodySize();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.setBodySize();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent){
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;

    switch (this.activeResize) {
      case ResizePanel.Left:
        this.resizeLeft();
        break;
    }
  }

  isDocumentFolder(document: FileFolder) {
    return document.type === FileType.Folder;
  }

  isOwner(document: FileFolder): boolean {
    return document.owner._id === this.loggedUserId;
  }

  isInGroup(document: FileFolder): boolean {
    if (!util.valueExist(document.group) ||
      !util.valueExist(document.group.members)) {
        return false;
      }
    const loggedUserIndex = document.group.members.findIndex(elt => elt.user._id === this.loggedUserId);
    return loggedUserIndex >= 0;
  }

  hasAccess(document: FileFolder, accessType: AccessType): boolean {
    const writeAccess: number[] = [2, 3, 6, 7];
    const readAccess: number[] = [4, 5, 6, 7];
    const executeAccess: number[] = [1, 3, 5, 7];

    let userAccess: number = document.memberAccess.other;
    if ( this.isOwner(document) ) {
      userAccess = document.memberAccess.owner;
    } else if ( this.isInGroup(document) ) {
      userAccess = document.memberAccess.group;
    }

    switch (accessType) {
      case AccessType.Write:
        return writeAccess.includes(userAccess);
      case AccessType.Read:
        return readAccess.includes(userAccess);
      case AccessType.Execute:
        return executeAccess.includes(userAccess);
    }

    return false;
  }

  loadPublicDocument() {
    this.documentService.fetchPublicDocuments().then(result => {
      if ( result.success && result.returnValue) {
        const returnValue: TreeNode[] = result.returnValue;
        this.publicDocuments.splice(0, this.publicDocuments.length);
        returnValue.forEach( elt => {
          if ( this.hasAccess(elt.data, AccessType.Read) ) {
            this.publicDocuments.push(elt);
          }
        });
      }
    });
  }

  loadPrivateDocument() {
    this.documentService.fetchPrivateDocuments().then(result => {
      if (result.success) {
        this.privateDocuments = result.returnValue;
      }
    });
  }

  setResizePanel(event: MouseEvent, resizePanel: ResizePanel) {
    event.stopPropagation();
    this.activeResize = resizePanel;
  }

  setBodySize() {
    this.widthBody = this.winWidth - this.widthBarLeft - this.widthBarRight - 20;
  }

  getDocumentById(id: string) {
    this.spinner.show();
    this.documentService.getFileFolder(id).then(value => {
      this.spinner.hide();
      if ( value.success ) {
        this.setEditorMenuItem(value.returnValue);
      }
    });
  }

  setEditorMenuItem(document: FileFolder) {

    const tabId = EditorTabTag + document._id;
    if ( !this.navigationService.tabExist(tabId) ) {
      const fileMenuItem: MenuItem = {
        id: tabId,
        icon: 'icon icon-file',
        label: document.name,
        routerLink: LoideRoute.Editor,
        queryParams: { item: document._id}
      };
      this.navigationService.inject(fileMenuItem);
    }
    this.navigationService.setEditorState(tabId, document);
  }

  onToolbarEvent($event: LoideToolbarItems) {
    switch ($event) {
      case LoideToolbarItems.SaveFile:
        this.saveDocument();
        break;
    }
  }

  toggleSidebarLeft($event: EventSidebar) {
    this.sidebarEvent = $event;

    if (this.sidebarEvent.left) {
      this.widthBarLeft = this.sidebarEvent.visible ? 240 : 40;
    } else if (this.sidebarEvent.right) {
      this.widthBarRight = this.sidebarEvent.visible ? 240 : 40;
    }
    this.setBodySize();
  }

  isSingleBarOpen(): boolean {
    if ((this.sidebarRight && !this.sidebarLeft) ||
      (!this.sidebarRight && this.sidebarLeft)) {
        return true;
      }
    return false;
  }

  isBothBarOpen(): boolean {
    if (this.sidebarRight && this.sidebarLeft) {
      return true;
    }
    return false;
  }

  isChanged(editorState: EditorState): boolean {
    return editorState && editorState.changed;
  }

  closeItem(event, item) {
    this.navigationService.closeEditorTab(item);
    event.preventDefault();
  }

  saveDocument() {
    if ( this.editorState && this.editorState.changed ) {
      this.documentService.updateDocument(this.editorState.currentDocument._id, this.editorState.currentDocument.content).then( value => {
        if ( value.success ) {
          this.setEditorState(value.returnValue);
        }
      });
    }
  }

  setEditorState(document) {
    const tabId = EditorTabTag + document._id;
    if ( this.navigationService.tabExist(tabId) ) {
      this.navigationService.setEditorState(tabId, document);
      this.navigationService.documentChanged(tabId, false);
    }
  }

  resizeLeft() {
    if ( this.mouse.x > 40) {
      this.widthBarLeft = this.mouse.x;
      this.setBodySize();

      if ( this.mouse.x >= 60 ) {
        this.openSidebarLeftByResize = true;
      } else {
        this.openSidebarLeftByResize = false;
      }
    } else {
      this.openSidebarLeftByResize = false;
    }
  }

}
