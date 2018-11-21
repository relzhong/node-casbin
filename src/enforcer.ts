// Copyright 2018 The Casbin Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ManagementEnforcer } from './managementEnforcer';
import { FunctionMap, Model } from './model';
import { Adapter } from './persist';
import { setEnableLog } from './util';

/**
 * Enforcer = ManagementEnforcer + RBAC API.
 */
export class Enforcer extends ManagementEnforcer {
  /**
   * newEnforcer creates an enforcer via model define in text or Model instance And a policy Adapter.
   *
   * File:
   * ```js
   * const e = new Enforcer('model define', new FileAdapter(policyPath));
   * ```
   * or
   * ```
   * const e = new Enforcer(new Model(), new FileAdapter(policyPath));
   * ```
   *
   * MySQL DB:
   * ```js
   * const a = new MySQLAdapter('mysql', 'mysql_username:mysql_password@tcp(127.0.0.1:3306)/');
   * const e = new Enforcer('model define', a);
   * ```
   *
   * @param params
   */
  public static async newEnforcer(...params: any[]): Promise<Enforcer> {
    const e = new Enforcer();

    let parsedParamLen = 0;
    if (params.length >= 1) {
      const enableLog = params[params.length - 1];
      if (typeof enableLog === 'boolean') {
        setEnableLog(enableLog);
        parsedParamLen++;
      }
    }

    if (params.length - parsedParamLen === 2) {
      if (typeof params[0] === 'string') {
        const m = new Model();
        m.loadModelFromText(params[0]);
        await e.initWithModelAndAdapter(m, params[1]);
      } else {
        if (typeof params[1] === 'string') {
          throw new Error('Invalid parameters for enforcer.');
        } else {
          await e.initWithModelAndAdapter(params[0], params[1]);
        }
      }
    } else if (params.length - parsedParamLen === 1) {
      if (typeof params[0] === 'string') {
        const m = new Model();
        m.loadModelFromText(params[0]);
        await e.initWithModelAndAdapter(m);
      } else {
        await e.initWithModelAndAdapter(params[0]);
      }
    } else if (params.length === parsedParamLen) {
      const m = new Model();
      await e.initWithModelAndAdapter(m);
    } else {
      throw new Error('Invalid parameters for enforcer.');
    }
    return e;
  }

  /**
   * initWithModelAndAdapter initializes an enforcer with a model and a database adapter.
   * @param m model instance
   * @param adapter current adapter instance
   */
  public async initWithModelAndAdapter(m: Model, adapter?: Adapter): Promise<void> {
    if (adapter) {
      this.adapter = adapter;
    }

    this.model = m;
    this.model.printModel();
    this.fm = FunctionMap.loadFunctionMap();

    this.initialize();

    if (this.adapter) {
      // error intentionally ignored
      await this.loadPolicy();
    }
  }

  /**
   * getRolesForUser gets the roles that a user has.
   *
   * @param name the user.
   * @param domain the domain.
   * @return the roles that the user has.
   */
  public getRolesForUser(name: string, domain?: string): string[] {
    // @ts-ignore
    const rm = this.model.model.get('g').get('g').rm;
    if (domain == null) {
      return rm.getRoles(name);
    } else {
      return rm.getRoles(name, domain);
    }
  }

  /**
   * getUsersForRole gets the users that has a role.
   *
   * @param name the role.
   * @param domain the domain.
   * @return the users that has the role.
   */
  public getUsersForRole(name: string, domain?: string): string[] {
    // @ts-ignore
    const rm = this.model.model.get('g').get('g').rm;
    if (domain == null) {
      return rm.getUsers(name);
    } else {
      return rm.getUsers(name, domain);
    }
  }

  /**
   * hasRoleForUser determines whether a user has a role.
   *
   * @param name the user.
   * @param role the role.
   * @param domain the domain.
   * @return whether the user has the role.
   */
  public hasRoleForUser(name: string, role: string, domain?: string): boolean {
    const roles = this.getRolesForUser(name, domain);
    let hasRole: boolean = false;
    for (const r of roles) {
      if (r === role) {
        hasRole = true;
        break;
      }
    }

    return hasRole;
  }

  /**
   * addRoleForUser adds a role for a user.
   * Returns false if the user already has the role (aka not affected).
   *
   * @param user the user.
   * @param role the role.
   * @param domain the domain.
   * @return succeeds or not.
   */
  public async addRoleForUser(user: string, role: string, domain?: string): Promise<boolean> {
    if (domain == null) {
      return await this.addGroupingPolicy(user, role);
    } else {
      return await this.addGroupingPolicy(user, role, domain);
    }
  }

  /**
   * deleteRoleForUser deletes a role for a user.
   * Returns false if the user does not have the role (aka not affected).
   *
   * @param user the user.
   * @param role the role.
   * @param domain the domain.
   * @return succeeds or not.
   */
  public async deleteRoleForUser(user: string, role: string, domain?: string): Promise<boolean> {
    if (domain == null) {
      return await this.removeGroupingPolicy(user, role);
    } else {
      return await this.removeGroupingPolicy(user, role, domain);
    }
  }

  /**
   * deleteRolesForUser deletes all roles for a user.
   * Returns false if the user does not have any roles (aka not affected).
   *
   * @param user the user.
   * @return succeeds or not.
   */
  public async deleteRolesForUser(user: string): Promise<boolean> {
    return await this.removeFilteredGroupingPolicy(0, user);
  }

  /**
   * deleteUser deletes a user.
   * Returns false if the user does not exist (aka not affected).
   *
   * @param user the user.
   * @return succeeds or not.
   */
  public async deleteUser(user: string): Promise<boolean> {
    return await this.removeFilteredGroupingPolicy(0, user);
  }

  /**
   * deleteRole deletes a role.
   *
   * @param role the role.
   */
  public async deleteRole(role: string): Promise<void> {
    await this.removeFilteredGroupingPolicy(1, role);
    await this.removeFilteredPolicy(0, role);
  }

  /**
   * deletePermission deletes a permission.
   * Returns false if the permission does not exist (aka not affected).
   *
   * @param permission the permission, usually be (obj, act). It is actually the rule without the subject.
   * @return succeeds or not.
   */
  public async deletePermission(...permission: string[]): Promise<boolean> {
    return await this.removeFilteredPolicy(1, ...permission);
  }

  /**
   * addPermissionForUser adds a permission for a user or role.
   * Returns false if the user or role already has the permission (aka not affected).
   *
   * @param user the user.
   * @param permission the permission, usually be (obj, act). It is actually the rule without the subject.
   * @return succeeds or not.
   */
  public async addPermissionForUser(user: string, ...permission: string[]): Promise<boolean> {
    permission.unshift(user);
    return await this.addPolicy(...permission);
  }

  /**
   * deletePermissionForUser deletes a permission for a user or role.
   * Returns false if the user or role does not have the permission (aka not affected).
   *
   * @param user the user.
   * @param permission the permission, usually be (obj, act). It is actually the rule without the subject.
   * @return succeeds or not.
   */
  public async deletePermissionForUser(user: string, ...permission: string[]): Promise<boolean> {
    permission.unshift(user);
    return await this.removePolicy(...permission);
  }

  /**
   * deletePermissionsForUser deletes permissions for a user or role.
   * Returns false if the user or role does not have any permissions (aka not affected).
   *
   * @param user the user.
   * @return succeeds or not.
   */
  public async deletePermissionsForUser(user: string): Promise<boolean> {
    return await this.removeFilteredPolicy(0, user);
  }

  /**
   * getPermissionsForUser gets permissions for a user or role.
   *
   * @param user the user.
   * @return the permissions, a permission is usually like (obj, act). It is actually the rule without the subject.
   */
  public getPermissionsForUser(user: string): string[][] {
    return this.getFilteredPolicy(0, user);
  }

  /**
   * hasPermissionForUser determines whether a user has a permission.
   *
   * @param user the user.
   * @param permission the permission, usually be (obj, act). It is actually the rule without the subject.
   * @return whether the user has the permission.
   */
  public hasPermissionForUser(user: string, ...permission: string[]): boolean {
    permission.unshift(user);
    return this.hasPolicy(...permission);
  }
}
