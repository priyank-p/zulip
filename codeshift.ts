import type * as recast from 'recast';
import type j from 'jscodeshift';

let codeshift: j.JSCodeshift;

// A convient menthod to perform recast type assertions.
// Type for CheckArgType is a disaster but it's ok.
type CheckArgType = [unknown, recast.Type<unknown>];
function check(...checks: CheckArgType[]): boolean {
    for (let i = 0; i < checks.length; i++) {
        const [ item, type ] = checks[i];
        if (type.check(item) == false) {
            return false;
        }
    }

    return true;
}

function requireToImport(path: j.ASTPath<j.VariableDeclaration>) {
    const checks = check(
        [path.value.declarations[0], codeshift.VariableDeclarator],
        [(path.value.declarations[0] as any)?.init, codeshift.CallExpression],
        [(path.value.declarations[0] as any)?.id, codeshift.Identifier],
        [(path.value.declarations[0] as any)?.init?.callee, codeshift.Identifier],
        [((path.value.declarations[0] as any)?.init?.arguments || [])[0], codeshift.Literal]
    );

    if (!checks) {
        return;
    }

    const declaration = path.value.declarations[0] as j.VariableDeclarator;
    const callExpresion = declaration.init as j.CallExpression;
    const moduleIdentifier = declaration.id as j.Identifier;
    const callee = callExpresion.callee as j.Identifier;
    const requireArgument = callExpresion.arguments[0] as j.Literal;

    if (callee.name !== 'require') {
        return;
    }

    const variableName = moduleIdentifier.name;
    const modulePath = requireArgument.value;
    const importStatement = codeshift.importDeclaration(
        [codeshift.importDefaultSpecifier(codeshift.identifier(variableName))],
        codeshift.literal(modulePath)
    );

    path.replace(importStatement);
}

function commonjsExportToES6(path: j.ASTPath<j.ExpressionStatement>) {
    let checks = check(
        [path.value.expression, codeshift.AssignmentExpression],
        [(path.value.expression as any)?.left, codeshift.MemberExpression],
        [(path.value.expression as any)?.left?.object, codeshift.Identifier],
        [(path.value.expression as any)?.left?.property, codeshift.Identifier],
    );

    checks = checks && (path.value.expression as any)?.operator === '=';
    checks = checks && (path.value.expression as any)?.left?.object?.name == 'exports';

    if (!checks) {
        return;
    }

    const expression = path.value.expression as j.AssignmentExpression;
    const left = expression.left as j.MemberExpression;
    const leftProperty = left.property as j.Identifier;
    const right = expression.right;

    let exportStatment;
    if (codeshift.FunctionExpression.check(right)) {
        right.id = codeshift.identifier(leftProperty.name);
        exportStatment = codeshift.exportDeclaration(
            false, right,
            [codeshift.exportSpecifier(null, codeshift.identifier(leftProperty.name))],
            null
        );
    } else {
        exportStatment = codeshift.exportNamedDeclaration(
            codeshift.variableDeclaration(
                'let', [codeshift.variableDeclarator(leftProperty, right)]
            ), []
        );
    }

    path.replace(exportStatment);
}

export default function transformer(fileInfo: j.FileInfo, api: j.API) {
    codeshift = api.jscodeshift;
    const transformer = codeshift(fileInfo.source);

    transformer.find(codeshift.VariableDeclaration).forEach(requireToImport);
    transformer.find(codeshift.ExpressionStatement).forEach(commonjsExportToES6);
    return transformer.toSource();
}
