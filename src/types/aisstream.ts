/**
 * AIS wire-format interfaces matching the actual PascalCase JSON
 * from the aisstream.io WebSocket API.
 *
 * Reference: @aisstream/aisstream npm package (auto-generated from OpenAPI spec)
 */

export interface AisStreamMetaData {
  MMSI: number;
  longitude: number;
  latitude: number;
  time_utc: string;
  ShipName: string;
}

export interface ShipStaticDataDimension {
  A: number;
  B: number;
  C: number;
  D: number;
}

export interface ShipStaticDataEta {
  Month: number;
  Day: number;
  Hour: number;
  Minute: number;
}

export interface PositionReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  NavigationalStatus: number;
  RateOfTurn: number;
  Sog: number;
  Cog: number;
  TrueHeading: number;
  Longitude: number;
  Latitude: number;
  PositionAccuracy: boolean;
  Timestamp: number;
  Raim: boolean;
  SpecialManoeuvreIndicator: number;
  CommunicationState: number;
  Spare: number;
}

export interface ShipStaticData {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  AisVersion: number;
  ImoNumber: number;
  CallSign: string;
  Name: string;
  Type: number;
  Dimension: ShipStaticDataDimension;
  FixType: number;
  Eta: ShipStaticDataEta;
  MaximumStaticDraught: number;
  Destination: string;
  Dte: boolean;
  Spare: boolean;
}

export interface StandardClassBPositionReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  Sog: number;
  Cog: number;
  TrueHeading: number;
  Longitude: number;
  Latitude: number;
  PositionAccuracy: boolean;
  Timestamp: number;
  Raim: boolean;
  ClassBUnit: boolean;
  ClassBDisplay: boolean;
  ClassBDsc: boolean;
  ClassBBand: boolean;
  ClassBMsg22: boolean;
  AssignedMode: boolean;
  CommunicationStateIsItdma: boolean;
  CommunicationState: number;
  Spare1: number;
  Spare2: number;
}

export interface ExtendedClassBPositionReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  Sog: number;
  Cog: number;
  TrueHeading: number;
  Longitude: number;
  Latitude: number;
  PositionAccuracy: boolean;
  Timestamp: number;
  Raim: boolean;
  Name: string;
  Type: number;
  Dimension: ShipStaticDataDimension;
  FixType: number;
  Dte: boolean;
  AssignedMode: boolean;
  Spare1: number;
  Spare2: number;
  Spare3: number;
}

export interface StaticDataReportReportA {
  Valid: boolean;
  Name: string;
}

export interface StaticDataReportReportB {
  Valid: boolean;
  ShipType: number;
  VendorIDName: string;
  VenderIDModel: number;
  VenderIDSerial: number;
  CallSign: string;
  Dimension: ShipStaticDataDimension;
  FixType: number;
  Spare: number;
}

export interface StaticDataReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  Reserved: number;
  PartNumber: boolean;
  ReportA: StaticDataReportReportA;
  ReportB: StaticDataReportReportB;
}

export interface AidsToNavigationReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  Type: number;
  Name: string;
  PositionAccuracy: boolean;
  Longitude: number;
  Latitude: number;
  Dimension: ShipStaticDataDimension;
  FixType: number;
  Timestamp: number;
  OffPosition: boolean;
  Raim: boolean;
  VirtualAtoN: boolean;
  AssignedMode: boolean;
  Spare: number;
  NameExtension: string;
  AtoN: number;
}

export interface BaseStationReport {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
  UtcYear: number;
  UtcMonth: number;
  UtcDay: number;
  UtcHour: number;
  UtcMinute: number;
  UtcSecond: number;
  PositionAccuracy: boolean;
  Longitude: number;
  Latitude: number;
  FixType: number;
  Raim: boolean;
  CommunicationState: number;
  LongRangeEnable: boolean;
  Spare: number;
}

export interface SingleSlotBinaryMessage {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
}

export interface MultiSlotBinaryMessage {
  MessageID: number;
  RepeatIndicator: number;
  UserID: number;
  Valid: boolean;
}

export interface AisMessageContent {
  PositionReport?: PositionReport;
  ShipStaticData?: ShipStaticData;
  StandardClassBPositionReport?: StandardClassBPositionReport;
  ExtendedClassBPositionReport?: ExtendedClassBPositionReport;
  StaticDataReport?: StaticDataReport;
  AidsToNavigationReport?: AidsToNavigationReport;
  BaseStationReport?: BaseStationReport;
  SingleSlotBinaryMessage?: SingleSlotBinaryMessage;
  MultiSlotBinaryMessage?: MultiSlotBinaryMessage;
}

export interface AisStreamMessage {
  MetaData: AisStreamMetaData;
  MessageType: AisMessageType;
  Message: AisMessageContent;
}

export interface SubscriptionMessage {
  APIkey: string;
  BoundingBoxes: number[][][];
  FilterMessageTypes: AisMessageType[];
  FiltersShipMMSI?: string[];
}

export type AisMessageType =
  | 'PositionReport'
  | 'ShipStaticData'
  | 'StandardClassBPositionReport'
  | 'ExtendedClassBPositionReport'
  | 'StaticDataReport'
  | 'AidsToNavigationReport'
  | 'BaseStationReport'
  | 'SingleSlotBinaryMessage'
  | 'MultiSlotBinaryMessage';
